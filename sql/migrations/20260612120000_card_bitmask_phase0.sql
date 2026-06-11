-- Phase 0: Bitmask card definitions + reverse number index
-- Extends global card pool (card_pool_cards / card_numbers) without duplicating definitions.
-- Room-specific state (tickets, marks, masks) remains unchanged.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. bit_position on card_numbers (derived from row_no + col_no ordering)
-- ---------------------------------------------------------------------------

ALTER TABLE public.card_numbers
  ADD COLUMN IF NOT EXISTS bit_position smallint;

ALTER TABLE public.card_numbers
  DROP CONSTRAINT IF EXISTS card_numbers_bit_position_range;

ALTER TABLE public.card_numbers
  ADD CONSTRAINT card_numbers_bit_position_range
  CHECK (bit_position IS NULL OR (bit_position >= 0 AND bit_position <= 14));

-- ---------------------------------------------------------------------------
-- 2. Precomputed win masks per global card (one row per pool_card_id)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.card_definition_masks (
  pool_card_id bigint PRIMARY KEY
    REFERENCES public.card_pool_cards(id) ON DELETE CASCADE,
  line1_mask integer NOT NULL,
  line2_mask integer NOT NULL,
  line3_mask integer NOT NULL,
  full_mask integer NOT NULL,
  cell_count smallint NOT NULL DEFAULT 15
    CHECK (cell_count > 0 AND cell_count <= 15),
  computed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.card_definition_masks IS
  'Precomputed 15-bit win masks per global card template. Shared across all rooms.';

-- ---------------------------------------------------------------------------
-- 3. Global reverse index: drawn number -> card + bit position
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.card_number_index (
  value smallint NOT NULL CHECK (value BETWEEN 1 AND 90),
  pool_card_id bigint NOT NULL
    REFERENCES public.card_pool_cards(id) ON DELETE CASCADE,
  bit_position smallint NOT NULL CHECK (bit_position BETWEEN 0 AND 14),
  PRIMARY KEY (value, pool_card_id)
);

CREATE INDEX IF NOT EXISTS idx_card_number_index_value
  ON public.card_number_index (value);

COMMENT ON TABLE public.card_number_index IS
  'Global reverse lookup: which cards contain a given bingo number and at which bit position.';

-- ---------------------------------------------------------------------------
-- 4. Backfill function — derives bit positions and masks from card_numbers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_backfill_card_bitmask_definitions()
RETURNS TABLE (
  cards_processed bigint,
  index_rows bigint,
  mask_rows bigint
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_cards bigint := 0;
  v_index bigint := 0;
  v_masks bigint := 0;
BEGIN
  -- Assign bit_position: row 1 cols asc -> 0..4, row 2 -> 5..9, row 3 -> 10..14
  WITH ordered AS (
    SELECT
      cn.pool_card_id,
      cn.row_no,
      cn.col_no,
      cn.value,
      ROW_NUMBER() OVER (
        PARTITION BY cn.pool_card_id, cn.row_no
        ORDER BY cn.col_no
      ) - 1 AS pos_in_row
    FROM public.card_numbers cn
  ),
  positioned AS (
    SELECT
      pool_card_id,
      row_no,
      col_no,
      value,
      CASE row_no
        WHEN 1 THEN pos_in_row
        WHEN 2 THEN pos_in_row + 5
        WHEN 3 THEN pos_in_row + 10
        ELSE NULL
      END AS bit_position
    FROM ordered
    WHERE row_no BETWEEN 1 AND 3
  )
  UPDATE public.card_numbers cn
  SET bit_position = p.bit_position
  FROM positioned p
  WHERE cn.pool_card_id = p.pool_card_id
    AND cn.row_no = p.row_no
    AND cn.col_no = p.col_no
    AND cn.value = p.value;

  -- Rebuild reverse index
  TRUNCATE public.card_number_index;

  INSERT INTO public.card_number_index (value, pool_card_id, bit_position)
  SELECT cn.value, cn.pool_card_id, cn.bit_position
  FROM public.card_numbers cn
  WHERE cn.bit_position IS NOT NULL
  ON CONFLICT (value, pool_card_id) DO UPDATE
  SET bit_position = EXCLUDED.bit_position;

  GET DIAGNOSTICS v_index = ROW_COUNT;

  -- Rebuild win masks
  TRUNCATE public.card_definition_masks;

  INSERT INTO public.card_definition_masks (
    pool_card_id,
    line1_mask,
    line2_mask,
    line3_mask,
    full_mask,
    cell_count
  )
  SELECT
    cn.pool_card_id,
    COALESCE(SUM(CASE WHEN cn.row_no = 1 THEN (1 << cn.bit_position) ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN cn.row_no = 2 THEN (1 << cn.bit_position) ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN cn.row_no = 3 THEN (1 << cn.bit_position) ELSE 0 END), 0)::integer,
    COALESCE(SUM(1 << cn.bit_position), 0)::integer,
    COUNT(*)::smallint
  FROM public.card_numbers cn
  WHERE cn.bit_position IS NOT NULL
  GROUP BY cn.pool_card_id;

  GET DIAGNOSTICS v_masks = ROW_COUNT;

  SELECT COUNT(DISTINCT pool_card_id)
    INTO v_cards
  FROM public.card_numbers
  WHERE bit_position IS NOT NULL;

  cards_processed := v_cards;
  index_rows := v_index;
  mask_rows := v_masks;
  RETURN NEXT;
END;
$$;

-- Run backfill for existing pool
SELECT * FROM public.fn_backfill_card_bitmask_definitions();

COMMIT;
