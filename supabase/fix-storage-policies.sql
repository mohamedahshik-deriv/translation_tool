-- Fix Storage Policies for Anonymous Access
-- Run this in Supabase SQL Editor

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access to videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to segments" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to segments" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to audio" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to audio" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to exports" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to exports" ON storage.objects;

-- Create permissive policies for all buckets (allows anonymous access)
-- Videos bucket
CREATE POLICY "Allow all access to videos" ON storage.objects
FOR ALL USING (bucket_id = 'videos') WITH CHECK (bucket_id = 'videos');

-- Segments bucket
CREATE POLICY "Allow all access to segments" ON storage.objects
FOR ALL USING (bucket_id = 'segments') WITH CHECK (bucket_id = 'segments');

-- Audio bucket
CREATE POLICY "Allow all access to audio" ON storage.objects
FOR ALL USING (bucket_id = 'audio') WITH CHECK (bucket_id = 'audio');

-- Exports bucket
CREATE POLICY "Allow all access to exports" ON storage.objects
FOR ALL USING (bucket_id = 'exports') WITH CHECK (bucket_id = 'exports');
