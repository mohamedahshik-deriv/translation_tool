# Supabase Setup Instructions for POD Translation Automation

Please set up the following in my Supabase project:

---

## 1. Storage Buckets

Create 4 storage buckets with public access:

### Bucket 1: `videos`
- Purpose: Store uploaded user videos
- Public: Yes
- File size limit: 50MB
- Allowed MIME types: video/mp4, video/quicktime, video/webm

### Bucket 2: `segments`
- Purpose: Store cut video segments
- Public: Yes
- File size limit: 50MB
- Allowed MIME types: video/mp4

### Bucket 3: `audio`
- Purpose: Store generated audio dubbing files
- Public: Yes
- File size limit: 20MB
- Allowed MIME types: audio/mpeg, audio/mp3

### Bucket 4: `exports`
- Purpose: Store final exported videos
- Public: Yes
- File size limit: 100MB
- Allowed MIME types: video/mp4

---

## 2. Edge Functions Secrets

Set the following secrets for Edge Functions:

```
GEMINI_API_KEY = [Your Google Gemini API Key]
DEEPL_API_KEY = [Your DeepL API Key]
ELEVENLABS_API_KEY = [Your ElevenLabs API Key]
```

---

## 3. Edge Functions to Deploy

Deploy 5 Edge Functions:

### Function 1: `analyze-scenes`
- Purpose: Analyze video using Google Gemini AI to detect scene changes
- Method: POST
- Input: `{ videoUrl: string, videoDuration: number }`
- Output: `{ timecodes: number[], scenes: [{ startTime, endTime, description }] }`
- Uses: GEMINI_API_KEY secret

### Function 2: `match-script-to-scenes`
- Purpose: Analyze video AND a script document together using Gemini, matching script entries (text-on-screen, voiceover) to detected video scenes
- Method: POST
- Input: `{ videoUrl: string, videoDuration: number, scriptText: string }`
- Output: `{ timecodes: number[], scenes: [{ startTime, endTime, description, textOnScreen, voiceover, suggestedPosition }] }`
- Uses: GEMINI_API_KEY secret
- Deploy command: `supabase functions deploy match-script-to-scenes`

### Function 3: `translate`
- Purpose: Translate text using DeepL API
- Method: POST
- Input: `{ texts: string[], sourceLang: string, targetLangs: string[] }`
- Output: `{ translations: { [langCode]: string[] } }`
- Uses: DEEPL_API_KEY secret
- Supported languages: EN, ES, PT, AR, FR

### Function 4: `clone-voice`
- Purpose: Clone a voice using ElevenLabs API
- Method: POST
- Input: FormData with `audio` file and `name` string
- Output: `{ voiceId: string, name: string }`
- Uses: ELEVENLABS_API_KEY secret

### Function 5: `generate-speech`
- Purpose: Generate speech from text using cloned voice
- Method: POST
- Input: `{ text: string, voiceId: string, languageCode: string }`
- Output: Audio binary (audio/mpeg)
- Uses: ELEVENLABS_API_KEY secret

---

## 4. CORS Configuration

Enable CORS for all Edge Functions with these headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
```

---

## 5. Storage Policies (RLS)

For all 4 buckets, create policies to allow:
- **SELECT** (read): Allow all authenticated and anonymous users
- **INSERT** (upload): Allow all authenticated and anonymous users
- **DELETE**: Allow all authenticated and anonymous users

Example policy for each bucket:
```sql
-- Allow public read access
CREATE POLICY "Public read access" ON storage.objects
FOR SELECT USING (bucket_id = 'videos');

-- Allow public upload
CREATE POLICY "Public upload access" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'videos');

-- Allow public delete
CREATE POLICY "Public delete access" ON storage.objects
FOR DELETE USING (bucket_id = 'videos');
```

Repeat for buckets: `segments`, `audio`, `exports`

---

## Summary Checklist

- [ ] Create storage bucket: `videos`
- [ ] Create storage bucket: `segments`
- [ ] Create storage bucket: `audio`
- [ ] Create storage bucket: `exports`
- [ ] Set storage policies for public access on all buckets
- [ ] Set secret: `GEMINI_API_KEY`
- [ ] Set secret: `DEEPL_API_KEY`
- [ ] Set secret: `ELEVENLABS_API_KEY`
- [ ] Deploy Edge Function: `analyze-scenes`
- [ ] Deploy Edge Function: `translate`
- [ ] Deploy Edge Function: `clone-voice`
- [ ] Deploy Edge Function: `generate-speech`
- [ ] Enable CORS on all Edge Functions

---

## Edge Function Code

The Edge Function code files are located in:
- `supabase/functions/analyze-scenes/index.ts`
- `supabase/functions/translate/index.ts`
- `supabase/functions/clone-voice/index.ts`
- `supabase/functions/generate-speech/index.ts`

These can be deployed using Supabase CLI:
```bash
supabase functions deploy analyze-scenes
supabase functions deploy translate
supabase functions deploy clone-voice
supabase functions deploy generate-speech
```
