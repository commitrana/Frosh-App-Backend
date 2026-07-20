const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

// Requires in .env:
//   SUPABASE_URL=https://xxxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=eyJ...        (Project Settings → API → service_role key,
//                                             NOT the anon key — this needs write access
//                                             and must never be shipped to the frontend/app)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Create this bucket once in the Supabase dashboard (Storage → New bucket),
// name it exactly "team-photos", and mark it Public — that's what lets the
// mobile app load images with a plain URL, no auth needed.
const BUCKET = 'team-photos';

/**
 * Resizes + compresses the image, uploads it to Supabase Storage, and
 * returns the public URL. Keeping every photo small (WebP, capped at
 * 500x500) is what makes serving ~100 images to 4,000+ students sustainable
 * on the free tier — see the note in the chat response for the bandwidth math.
 */
async function uploadToImageHost(buffer) {
  const optimized = await sharp(buffer)
    .resize(500, 500, { fit: 'cover' })
    .webp({ quality: 75 })
    .toBuffer();

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
  const path = `members/${fileName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, optimized, {
      contentType: 'image/webp',
      cacheControl: '31536000', // 1 year — safe because each upload gets a
                                 // unique filename, images are never overwritten
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return { url: data.publicUrl, path };
}

/**
 * Deletes an image from the bucket. Call this whenever a TeamMember doc is
 * deleted (or replaced), otherwise storage just grows forever with orphans.
 */
async function deleteFromImageHost(path) {
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error('⚠️ Failed to delete image from storage:', error.message);
}

// Swapping providers later (e.g. to Google Drive) means editing only this
// file — routes/team.js only ever calls uploadToImageHost / deleteFromImageHost.
module.exports = { uploadToImageHost, deleteFromImageHost };