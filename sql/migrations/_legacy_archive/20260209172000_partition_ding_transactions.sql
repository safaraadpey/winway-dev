BEGIN;

ALTER TABLE public.ding_transactions RENAME TO ding_transactions_old;

CREATE TABLE public.ding_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  room_id uuid NULL,
  ticket_id uuid NULL,
  draw_id uuid NULL,
  drawn_number integer NOT NULL,
  amount numeric NOT NULL,
  description text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at),
  CONSTRAINT ding_transactions_drawn_number_check CHECK (drawn_number >= 1 AND drawn_number <= 90),
  CONSTRAINT ding_transactions_amount_check CHECK (amount > 0::numeric),
  CONSTRAINT ding_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT ding_transactions_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id),
  CONSTRAINT ding_transactions_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id),
  CONSTRAINT ding_transactions_draw_id_fkey FOREIGN KEY (draw_id) REFERENCES public.draws(id)
) PARTITION BY RANGE (created_at);

DO $$
DECLARE
  d date;
BEGIN
  FOR d IN
    SELECT generate_series(
      date_trunc('week', current_date - interval '8 weeks')::date,
      date_trunc('week', current_date + interval '2 weeks')::date,
      interval '1 week'
    )::date
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.ding_transactions_p%s PARTITION OF public.ding_transactions FOR VALUES FROM (%L) TO (%L);',
      to_char(d, 'IYYYIW'),
      d,
      (d + interval ''1 week'')::date
    );
  END LOOP;
END$$;

CREATE TABLE IF NOT EXISTS public.ding_transactions_default
  PARTITION OF public.ding_transactions DEFAULT;

INSERT INTO public.ding_transactions (
  id, user_id, room_id, ticket_id, draw_id, drawn_number, amount, description, created_at
)
SELECT
  id, user_id, room_id, ticket_id, draw_id, drawn_number, amount, description, created_at
FROM public.ding_transactions_old;

DROP TABLE public.ding_transactions_old;

COMMIT;

