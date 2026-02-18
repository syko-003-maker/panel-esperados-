$query = @"
SELECT enumlabel FROM pg_enum 
WHERE enumtypid = 'public.LinkRequestStatus'::regtype 
ORDER BY enumsortorder;
"@

docker exec -i panel-postgres psql -U postgres -d postgres -c $query
