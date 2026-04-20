-- Fix Storage Policies for Anonymous Access

-- Drop initial storage policies
DROP POLICY IF EXISTS "Allow public read access to videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to segments" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to segments" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to audio" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to audio" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to exports" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to exports" ON storage.objects;

-- Replace with permissive policies that allow anonymous access
CREATE POLICY "Allow all access to videos" ON storage.objects
FOR ALL USING (bucket_id = 'videos') WITH CHECK (bucket_id = 'videos');

CREATE POLICY "Allow all access to segments" ON storage.objects
FOR ALL USING (bucket_id = 'segments') WITH CHECK (bucket_id = 'segments');

CREATE POLICY "Allow all access to audio" ON storage.objects
FOR ALL USING (bucket_id = 'audio') WITH CHECK (bucket_id = 'audio');

CREATE POLICY "Allow all access to exports" ON storage.objects
FOR ALL USING (bucket_id = 'exports') WITH CHECK (bucket_id = 'exports');
