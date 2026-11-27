export const accountStyle = `
:host{display:block;background:#10091e;color:#fff;font-family:inherit;min-height:100vh;min-height:100dvh}
.account-page{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}
.account-header{display:flex;align-items:center;justify-content:space-between;max-width:1240px;width:100%;margin:0 auto;padding:20px 26px;box-sizing:border-box}
.account-header img{width:152px;max-width:40vw;display:block}
.account-back{color:#ddd2ee;text-decoration:none;display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
.account-back:hover{color:#e7ff37}
.account-main{padding:30px 22px max(72px,env(safe-area-inset-bottom));flex:1;display:grid;place-items:center;min-width:0}
.account-card{width:100%;max-width:520px;box-sizing:border-box;border:1px solid rgba(181,127,242,.34);border-radius:28px;padding:clamp(24px,5vw,46px);background:radial-gradient(circle at top right,#381b65 0,#211038 43%,#1a102d 100%);box-shadow:0 24px 70px rgba(0,0,0,.32)}
.account-kicker{color:#e7ff37;text-transform:uppercase;font-weight:800;letter-spacing:.1em;font-size:11px}
.account-card h1{font-size:clamp(32px,5vw,50px);font-weight:900;letter-spacing:-.025em;line-height:1.1;margin:14px 0}
.account-lead{font-size:15px;color:#cfc1db;line-height:1.6;margin:0 0 26px}
.account-fields{display:grid;gap:var(--tds-space-5)}
.account-submit{width:100%}
.account-links .account-link{padding-inline:0;justify-content:flex-start}
.account-links{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px 20px;margin-top:22px}
.account-error{color:#ffc5d5;font-size:13px;background:rgba(194,26,75,.2);padding:12px;border-radius:10px}
.account-notice{color:#e7ff37;font-size:13px;padding:11px 0}
.account-private{border-top:1px solid #493259;padding-top:18px;margin-top:24px;font-size:12px;color:#ab9abf}
.account-private svg{display:inline;vertical-align:-2px;margin-right:6px}
@media(max-width:480px),(max-height:700px){.account-header{padding:12px max(16px,env(safe-area-inset-right)) 12px max(16px,env(safe-area-inset-left));padding-top:max(12px,env(safe-area-inset-top))}.account-header img{width:112px}.account-card{border-radius:20px;padding:20px}.account-main{align-items:start;padding:6px max(12px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))}.account-card h1{font-size:32px;margin:10px 0}.account-lead{font-size:14px;line-height:1.5;margin-bottom:18px}.account-fields{gap:14px}.account-fields input{font-size:16px;scroll-margin-block:16px}.account-submit{min-height:44px;scroll-margin-block:16px}.account-links{gap:6px 16px;margin-top:14px}.account-private{padding-top:12px;margin-top:14px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
`
