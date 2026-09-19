import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { userRepository } from '../db/repositories/user.repository.js';

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const googleId = profile.id;
          const googleAvatar = profile.photos?.[0]?.value;

          if (!email) {
            return done(null, { error: 'no_email', message: 'No email found from Google account' });
          }

          let user = await userRepository.findByGoogleId(googleId);
          let isNewUser = false;

          if (!user) {
            user = await userRepository.findByEmail(email, { withSensitive: true });
            if (user) {
              user = await userRepository.update(user.id, {
                googleId,
                googleAvatar: user.googleAvatar || googleAvatar,
                isEmailVerified: true,
              });
            } else {
              user = await userRepository.create({
                googleId,
                email,
                name: profile.displayName || email.split('@')[0],
                googleAvatar,
                isEmailVerified: true,
              });
              isNewUser = true;
            }
          }

          return done(null, { user, isNewUser });
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
}

export default passport;