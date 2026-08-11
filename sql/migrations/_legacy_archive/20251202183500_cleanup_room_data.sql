-- Migration: cleanup residual room data (utility)
-- Date: 2025-12-02

DELETE FROM public.room_winners;
DELETE FROM public.results;
DELETE FROM public.draw_jobs;
DELETE FROM public.draws;
DELETE FROM public.tickets;
DELETE FROM public.commissions_log;
DELETE FROM public.transactions WHERE room_id IS NOT NULL OR related_room IS NOT NULL OR source_room_id IS NOT NULL;
DELETE FROM public.rooms;


