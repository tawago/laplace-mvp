'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  fadeSpeed: number;
  type: 'star' | 'light' | 'wave' | 'circle';
  angle?: number;
  angleSpeed?: number;
  radius?: number;
}

export function LuxuryCanvasBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const animationRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const waveOffsetRef = useRef(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    // Initialize particles
    const initParticles = () => {
      particlesRef.current = [];
      
      // Floating golden orbs
      for (let i = 0; i < 20; i++) {
        particlesRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 4 + 2,
          speedX: (Math.random() - 0.5) * 0.3,
          speedY: (Math.random() - 0.5) * 0.3,
          opacity: Math.random() * 0.5 + 0.3,
          fadeSpeed: (Math.random() - 0.5) * 0.01,
          type: 'light'
        });
      }

      // Sparkle particles
      for (let i = 0; i < 60; i++) {
        particlesRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 1.5 + 0.5,
          speedX: (Math.random() - 0.5) * 0.2,
          speedY: (Math.random() - 0.5) * 0.2,
          opacity: Math.random() * 0.8,
          fadeSpeed: (Math.random() - 0.5) * 0.02,
          type: 'star'
        });
      }

      // Orbiting circles
      for (let i = 0; i < 5; i++) {
        const centerX = Math.random() * canvas.width;
        const centerY = Math.random() * canvas.height;
        particlesRef.current.push({
          x: centerX,
          y: centerY,
          size: Math.random() * 60 + 40,
          speedX: 0,
          speedY: 0,
          opacity: 0.1,
          fadeSpeed: 0.005,
          type: 'circle',
          angle: Math.random() * Math.PI * 2,
          angleSpeed: (Math.random() - 0.5) * 0.02,
          radius: Math.random() * 100 + 50
        });
      }
    };

    initParticles();

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      timeRef.current += 0.01;

      // Create gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      if (theme === 'dark') {
        gradient.addColorStop(0, '#0a0a0a');
        gradient.addColorStop(0.5, '#111827');
        gradient.addColorStop(1, '#1e293b');
      } else {
        gradient.addColorStop(0, '#dbeafe');
        gradient.addColorStop(0.5, '#bfdbfe');
        gradient.addColorStop(1, '#93c5fd');
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw flowing waves pattern
      ctx.save();
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.strokeStyle = theme === 'dark' 
          ? `rgba(251, 191, 36, ${0.1 - i * 0.03})` 
          : `rgba(59, 130, 246, ${0.2 - i * 0.05})`;
        ctx.lineWidth = 2;
        
        for (let x = 0; x <= canvas.width; x += 10) {
          const y = canvas.height / 2 + 
                   Math.sin((x * 0.01 + timeRef.current + i * 0.5)) * 50 +
                   Math.sin((x * 0.02 + timeRef.current * 2)) * 30;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
      ctx.restore();

      // Draw and update particles
      particlesRef.current.forEach((particle) => {
        if (particle.type === 'circle') {
          // Update orbiting circles
          particle.angle = (particle.angle || 0) + (particle.angleSpeed || 0.01);
          particle.opacity += particle.fadeSpeed;
          if (particle.opacity > 0.2 || particle.opacity < 0.05) {
            particle.fadeSpeed *= -1;
          }
        } else {
          // Update regular particles
          particle.x += particle.speedX;
          particle.y += particle.speedY;

          // Update opacity
          particle.opacity += particle.fadeSpeed;
          if (particle.opacity > 1 || particle.opacity < 0.1) {
            particle.fadeSpeed *= -1;
          }

          // Wrap particles around screen
          if (particle.x < -10) particle.x = canvas.width + 10;
          if (particle.x > canvas.width + 10) particle.x = -10;
          if (particle.y < -10) particle.y = canvas.height + 10;
          if (particle.y > canvas.height + 10) particle.y = -10;
        }

        // Draw particle
        ctx.save();
        
        if (particle.type === 'star') {
          // Draw sparkle
          ctx.globalAlpha = particle.opacity;
          const gradient = ctx.createRadialGradient(
            particle.x, particle.y, 0,
            particle.x, particle.y, particle.size * 2
          );
          gradient.addColorStop(0, theme === 'dark' ? '#fbbf24' : '#3b82f6');
          gradient.addColorStop(1, 'transparent');
          ctx.fillStyle = gradient;
          ctx.fillRect(
            particle.x - particle.size * 2,
            particle.y - particle.size * 2,
            particle.size * 4,
            particle.size * 4
          );
        } else if (particle.type === 'light') {
          // Draw golden orb
          ctx.globalAlpha = particle.opacity;
          const gradient = ctx.createRadialGradient(
            particle.x, particle.y, 0,
            particle.x, particle.y, particle.size * 4
          );
          gradient.addColorStop(0, 'rgba(251, 191, 36, 0.8)');
          gradient.addColorStop(0.5, 'rgba(251, 191, 36, 0.3)');
          gradient.addColorStop(1, 'rgba(251, 191, 36, 0)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size * 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (particle.type === 'circle') {
          // Draw orbiting circles
          ctx.globalAlpha = particle.opacity;
          ctx.strokeStyle = theme === 'dark' ? 'rgba(251, 191, 36, 0.3)' : 'rgba(59, 130, 246, 0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          ctx.stroke();
          
          // Draw orbiting dot
          const orbitX = particle.x + Math.cos(particle.angle || 0) * particle.size;
          const orbitY = particle.y + Math.sin(particle.angle || 0) * particle.size;
          ctx.fillStyle = theme === 'dark' ? '#fbbf24' : '#3b82f6';
          ctx.globalAlpha = particle.opacity * 2;
          ctx.beginPath();
          ctx.arc(orbitX, orbitY, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        
        ctx.restore();
      });

      // Add luxury overlay shimmer effect
      const shimmerGradient = ctx.createLinearGradient(
        0, 0, canvas.width, canvas.height
      );
      const shimmerOffset = (Date.now() * 0.0001) % 1;
      shimmerGradient.addColorStop(Math.max(0, shimmerOffset - 0.1), 'transparent');
      shimmerGradient.addColorStop(shimmerOffset, 'rgba(251, 191, 36, 0.05)');
      shimmerGradient.addColorStop(Math.min(1, shimmerOffset + 0.1), 'transparent');
      
      ctx.fillStyle = shimmerGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', setCanvasSize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ opacity: 0.6 }}
    />
  );
}