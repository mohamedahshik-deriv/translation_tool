-- POD Translation Automation - Initial Schema

-- ============================================
-- Create Storage Buckets
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('segments', 'segments', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('exports', 'exports', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Create Tables
-- ============================================

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours',
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    filename TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    duration FLOAT NOT NULL,
    status TEXT DEFAULT 'uploaded',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timecodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    start_time FLOAT NOT NULL,
    end_time FLOAT NOT NULL,
    segment_index INTEGER NOT NULL,
    segment_path TEXT
);

CREATE TABLE IF NOT EXISTS text_layers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timecode_id UUID REFERENCES timecodes(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    position_x TEXT DEFAULT '50%',
    position_y TEXT DEFAULT '80%',
    font_family TEXT DEFAULT 'Inter',
    font_size INTEGER DEFAULT 32,
    color TEXT DEFAULT '#ffffff',
    animation_type TEXT DEFAULT 'slide-up',
    animation_duration FLOAT DEFAULT 0.5
);

CREATE TABLE IF NOT EXISTS translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    text_layer_id UUID REFERENCES text_layers(id) ON DELETE CASCADE,
    language_code TEXT NOT NULL,
    translated_content TEXT NOT NULL,
    audio_path TEXT
);

CREATE TABLE IF NOT EXISTS exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    language_code TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Create Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_videos_session_id ON videos(session_id);
CREATE INDEX IF NOT EXISTS idx_timecodes_video_id ON timecodes(video_id);
CREATE INDEX IF NOT EXISTS idx_text_layers_timecode_id ON text_layers(timecode_id);
CREATE INDEX IF NOT EXISTS idx_translations_text_layer_id ON translations(text_layer_id);
CREATE INDEX IF NOT EXISTS idx_exports_video_id ON exports(video_id);

-- ============================================
-- Enable Row Level Security (RLS)
-- ============================================

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE timecodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE text_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies
-- ============================================

CREATE POLICY "Allow all operations on sessions" ON sessions FOR ALL USING (true);
CREATE POLICY "Allow all operations on videos" ON videos FOR ALL USING (true);
CREATE POLICY "Allow all operations on timecodes" ON timecodes FOR ALL USING (true);
CREATE POLICY "Allow all operations on text_layers" ON text_layers FOR ALL USING (true);
CREATE POLICY "Allow all operations on translations" ON translations FOR ALL USING (true);
CREATE POLICY "Allow all operations on exports" ON exports FOR ALL USING (true);

-- ============================================
-- Storage Policies
-- ============================================

CREATE POLICY "Allow public read access to videos" ON storage.objects
FOR SELECT USING (bucket_id = 'videos');

CREATE POLICY "Allow authenticated uploads to videos" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'videos');

CREATE POLICY "Allow public read access to segments" ON storage.objects
FOR SELECT USING (bucket_id = 'segments');

CREATE POLICY "Allow authenticated uploads to segments" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'segments');

CREATE POLICY "Allow public read access to audio" ON storage.objects
FOR SELECT USING (bucket_id = 'audio');

CREATE POLICY "Allow authenticated uploads to audio" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'audio');

CREATE POLICY "Allow public read access to exports" ON storage.objects
FOR SELECT USING (bucket_id = 'exports');

CREATE POLICY "Allow authenticated uploads to exports" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'exports');
