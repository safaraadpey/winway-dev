-- ActiveGames legacy hook compares rooms UPDATE old/new status; DEFAULT replica omits OLD columns.
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
