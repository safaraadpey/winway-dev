begin;

alter type public.transaction_type add value if not exists 'transfer_in';
alter type public.transaction_type add value if not exists 'transfer_out';

commit;


