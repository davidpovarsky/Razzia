import { type CSSProperties } from "react"
import "./tadazz-zz-transition.css"

export interface TadazzZZTransitionProps {
  logoUrl?: string
  durationMs?: number
  className?: string
}

/** CSS/SVG theatrical collision, not a video. Server remains responsible for timeline advancement. */
export function TadazzZZTransition({
  logoUrl,
  durationMs = 2900,
  className,
}: TadazzZZTransitionProps) {
  const duration = Math.min(6000, Math.max(1700, durationMs))

  return (
    <div
      aria-hidden="true"
      data-testid="tadazz-zz-transition"
      className={`tdz-zz-stage ${className ?? ""}`}
      style={{ "--tdz-zz-duration": `${duration}ms` } as CSSProperties}
    >
      <div className="tdz-zz-ring" />
      <div className="tdz-zz-letter tdz-zz-blue">
        <svg viewBox="0 0 180 180" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="tdz-zz-azure" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#8fe4ff"/>
              <stop offset=".5" stopColor="#1479ff"/>
              <stop offset="1" stopColor="#6c24ff"/>
            </linearGradient>
          </defs>
          <path d="M12 20 H159 L165 59 L76 127 H162 L157 164 H10 L14 129 L103 58 H10 Z"
            fill="url(#tdz-zz-azure)" stroke="#260751" strokeWidth="9" strokeLinejoin="round"/>
          <path d="M19 27 H146 L144 34 H41 Z" fill="#fff" opacity=".42"/>
        </svg>
      </div>
      <div className="tdz-zz-letter tdz-zz-lime">
        <svg viewBox="0 0 180 180" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="tdz-zz-citron" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#faff70"/>
              <stop offset=".65" stopColor="#edff17"/>
              <stop offset="1" stopColor="#b7e600"/>
            </linearGradient>
          </defs>
          <path d="M12 20 H159 L165 59 L76 127 H162 L157 164 H10 L14 129 L103 58 H10 Z"
            fill="url(#tdz-zz-citron)" stroke="#3a063b" strokeWidth="9" strokeLinejoin="round"/>
          <path d="M19 27 H146 L144 34 H41 Z" fill="#fff" opacity=".46"/>
        </svg>
      </div>
      <div className="tdz-zz-impact" />
      <div className="tdz-zz-burst tdz-zz-burst-a" />
      <div className="tdz-zz-burst tdz-zz-burst-b" />
      <div className="tdz-zz-burst tdz-zz-burst-c" />
      {logoUrl ? (
        <img className="tdz-zz-final-logo" src={logoUrl} alt="" />
      ) : (
        <div className="tdz-zz-wordmark">TADA<span>ZZ</span></div>
      )}
    </div>
  )
}
