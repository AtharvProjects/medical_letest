import React, { useEffect, useRef } from 'react';
import { HandwritingSvg } from './ui';
import logoImg from '../assets/logo.png';

/**
 * SplashScreen — full-viewport boot splash shown on every app startup.
 *
 * Plays the offline HandwritingSvg "Welcome to AthassMediSync" animation while
 * the license check runs in the background. A minimum display duration keeps
 * the splash up long enough for the animation to finish, since the localhost
 * license check usually resolves instantly.
 *
 * onDone fires exactly once (timer is started from a ref so parent re-renders,
 * e.g. the license status resolving, don't reset it).
 */
export default function SplashScreen({ onDone, minDuration = 3200 }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const t = setTimeout(() => {
      if (typeof doneRef.current === 'function') doneRef.current();
    }, minDuration);
    return () => clearTimeout(t);
  }, [minDuration]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        width: '100%',
        background: 'var(--bg-primary)',
        boxSizing: 'border-box',
        padding: 24,
        animation: 'splash-in 0.4s ease-out both',
      }}
    >
      <img
        src={logoImg}
        alt="Athass MediSync"
        style={{
          width: 320,
          maxWidth: '80vw',
          height: 'auto',
          marginBottom: 20,
          animation: 'splash-in 0.5s ease-out both',
        }}
      />
      <HandwritingSvg
        text="Welcome to AthassMediSync"
        width={620}
        height={135}
        fontSize={50}
        strokeWidth={1.6}
        duration={2.6}
        delay={0.2}
        style={{ display: 'block', color: '#A94F2D' }}
      />
      <p
        className="text-muted"
        style={{
          marginTop: 10,
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          animation: 'splash-in 0.7s ease-out 1.9s both',
        }}
      >
        Pharmacy Management System
      </p>

      <div
        className="text-muted"
        style={{
          position: 'fixed',
          bottom: 28,
          fontSize: 12,
          fontWeight: 500,
          opacity: 0.8,
          animation: 'splash-in 0.7s ease-out 2.3s both',
        }}
      >
        AthassMediSync v1.2.0
      </div>
    </div>
  );
}
