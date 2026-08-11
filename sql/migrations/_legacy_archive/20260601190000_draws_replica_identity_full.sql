-- LiveRoom listens to draws UPDATE (processed_at). DEFAULT replica only sends PK in OLD.
ALTER TABLE public.draws REPLICA IDENTITY FULL;
