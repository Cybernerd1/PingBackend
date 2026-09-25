import { ne, eq, and } from 'drizzle-orm';
import { db } from '../config/database.js';
import { users } from '../db/schema/users.js';
import { photos } from '../db/schema/photos.js';

// ─── Dummy stack shown when no real candidates are available ───────────
const DUMMY_CANDIDATES = [
  {
    id: 'dummy_1',
    username: 'Sophia',
    age: 23,
    jobTitle: 'UX Designer & Coffee Enthusiast',
    bio: 'Looking for someone to explore hidden coffee spots, talk about design, and go on weekend road trips! ☕✨',
    interests: ['🎨 Design', '☕ Coffee', '📷 Photography', '✈️ Travel', '🎧 Electronic'],
    photos: [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
    ],
    distanceKm: 2.8,
    location: 'Downtown, SF',
    height: "5'6\" (168 cm)",
    zodiac: '♌ Leo',
    education: 'Stanford University',
    hometown: 'San Francisco, CA',
    lookingFor: '💖 Long-term relationship',
    prompts: [
      { question: 'My simple pleasures...', answer: 'Hot pour-over espresso on crisp autumn mornings and finding rare vinyl records.' },
      { question: 'Together, we could...', answer: 'Cook an ambitious Italian dinner, debate interface design, and plan a weekend getaway.' },
    ],
    spotifyTrack: { name: 'Fred again..', track: 'Adore U', image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=300&q=80' },
  },
  {
    id: 'dummy_2',
    username: 'Liam',
    age: 26,
    jobTitle: 'Software Engineer & Indie Musician',
    bio: 'Code by day, play acoustic guitar by night. Let\'s make a killer playlist together 🎸',
    interests: ['🎸 Guitar', '💻 Coding', '🎧 Indie Rock', '🍕 Pizza', '🐕 Dogs'],
    photos: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
    ],
    distanceKm: 4.5,
    location: 'Mission District, SF',
    height: "6'1\" (185 cm)",
    zodiac: '♊ Gemini',
    education: 'UC Berkeley',
    hometown: 'Seattle, WA',
    lookingFor: '🥂 Casual & fun dates',
    prompts: [
      { question: 'Two truths and a lie...', answer: 'I play 4 instruments, I have climbed Mt. Rainier, I hate avocado toast.' },
      { question: 'My ideal Sunday...', answer: 'Farmer market stroll, jamming on the porch, and baking sourdough pizza.' },
    ],
    spotifyTrack: { name: 'The 1975', track: 'About You', image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=300&q=80' },
  },
  {
    id: 'dummy_3',
    username: 'Maya',
    age: 24,
    jobTitle: 'Architect & Potter',
    bio: 'Passionate about sustainable architecture and ceramics. Big fan of sunset walks and deep late-night conversations.',
    interests: ['🏺 Pottery', '🏛️ Architecture', '🌿 Plants', '🍷 Wine', '🎨 Fine Arts'],
    photos: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80',
    ],
    distanceKm: 1.2,
    location: 'Marina, SF',
    height: "5'7\" (170 cm)",
    zodiac: '♎ Libra',
    education: 'Cornell AAP',
    hometown: 'Portland, OR',
    lookingFor: '✨ Someone who loves creativity',
    prompts: [
      { question: 'I take pride in...', answer: 'Hand-throwing all the coffee mugs in my studio and building green rooftops.' },
    ],
    spotifyTrack: { name: 'Leon Bridges', track: 'Texas Sun', image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=300&q=80' },
  },
  {
    id: 'dummy_4',
    username: 'Ethan',
    age: 25,
    jobTitle: 'Fitness Coach & Hiker',
    bio: 'Early morning runner, bouldering lover, and amateur chef. Let\'s cook something awesome after a summit hike!',
    interests: ['🏃 Running', '🧗 Bouldering', '🍳 Cooking', '🐕 Dogs', '🏞️ Trail Running'],
    photos: [
      'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
    ],
    distanceKm: 3.1,
    location: 'Pacific Heights, SF',
    height: "6'0\" (183 cm)",
    zodiac: '♐ Sagittarius',
    education: 'UCLA',
    hometown: 'Denver, CO',
    lookingFor: '⛰️ Adventure buddy',
    prompts: [
      { question: 'First round is on me if...', answer: 'You can out-climb me at the boulder gym or teach me a secret pasta recipe.' },
    ],
    spotifyTrack: { name: 'Odesza', track: 'A Moment Apart', image: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=300&q=80' },
  },
];

// ─── Helper: calculate age from date of birth ──────────────────────────
const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const today = new Date();
  const dob = new Date(dateOfBirth);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
};

/**
 * GET /api/discovery/stack
 * Returns a stack of candidate profiles for the authenticated user to swipe on.
 * Falls back to curated dummy candidates when no real users are available.
 */
export const getDiscoveryStack = async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    // Query other completed users excluding the current user
    let candidates = [];
    try {
      const rows = await db
        .select({
          id: users.id,
          username: users.username,
          name: users.name,
          dateOfBirth: users.dateOfBirth,
          gender: users.gender,
          about: users.about,
          googleAvatar: users.googleAvatar,
          interestedIn: users.interestedIn,
        })
        .from(users)
        .where(
          and(
            ne(users.id, currentUserId),
            eq(users.onboardingCompleted, true)
          )
        )
        .limit(limit);

      if (rows.length > 0) {
        // Fetch photos for each candidate
        const candidateIds = rows.map((r) => r.id);
        const allPhotos = await db
          .select()
          .from(photos)
          .orderBy(photos.order);

        const photosByUser = {};
        for (const photo of allPhotos) {
          if (candidateIds.includes(photo.userId)) {
            if (!photosByUser[photo.userId]) photosByUser[photo.userId] = [];
            photosByUser[photo.userId].push(photo.url);
          }
        }

        candidates = rows.map((u) => ({
          id: u.id,
          username: u.username || u.name || 'Ping User',
          age: calculateAge(u.dateOfBirth),
          bio: u.about || '',
          interests: u.interestedIn || [],
          photos: photosByUser[u.id]?.length
            ? photosByUser[u.id]
            : u.googleAvatar
            ? [u.googleAvatar]
            : [],
        }));
      }
    } catch (dbErr) {
      // DB query failed — fall through to dummy data
      console.warn('[discovery/stack] DB query failed, using dummy data:', dbErr.message);
    }

    // Fall back to dummy candidates if no real ones found
    const isDummy = candidates.length === 0;
    const finalCandidates = isDummy ? DUMMY_CANDIDATES : candidates;

    return res.status(200).json({
      success: true,
      data: {
        candidates: finalCandidates,
        total: finalCandidates.length,
        isDummy,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/discovery/swipe
 * Records a swipe action (like / pass / superlike) on a candidate.
 * Returns { matched: boolean } — matching logic is a stub for now.
 */
export const recordSwipe = async (req, res, next) => {
  try {
    const { targetUserId, action } = req.body;

    if (!targetUserId || !['like', 'pass'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'targetUserId and action (like|pass) are required.',
      });
    }

    // Stub: random match simulation (replace with real match logic later)
    const matched = action === 'like' && Math.random() > 0.6;

    return res.status(200).json({
      success: true,
      data: {
        matched,
        targetUserId,
        action,
      },
    });
  } catch (error) {
    next(error);
  }
};
