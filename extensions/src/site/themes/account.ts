export const accountStyle = `
:host{display:block;background:#10091e;color:#fff;font-family:inherit;min-height:100vh}
.account-page{min-height:100vh;display:flex;flex-direction:column}
.account-header{display:flex;align-items:center;justify-content:space-between;max-width:1240px;width:100%;margin:0 auto;padding:20px 26px;box-sizing:border-box}
.account-header img{width:152px;max-width:40vw;display:block}
.account-back{color:#ddd2ee;text-decoration:none;display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
.account-back:hover{color:#e7ff37}
.account-main{padding:30px 22px 72px;flex:1;display:grid;place-items:center}
.account-card{width:100%;max-width:520px;box-sizing:border-box;border:1px solid rgba(181,127,242,.34);border-radius:28px;padding:clamp(24px,5vw,46px);background:radial-gradient(circle at top right,#381b65 0,#211038 43%,#1a102d 100%);box-shadow:0 24px 70px rgba(0,0,0,.32)}
.account-kicker{color:#e7ff37;text-transform:uppercase;font-weight:800;letter-spacing:.1em;font-size:11px}
.account-card h1{font-size:clamp(32px,5vw,50px);font-weight:900;letter-spacing:-.05em;line-height:1.1;margin:14px 0}
.account-lead{font-size:15px;color:#cfc1db;line-height:1.6;margin:0 0 26px}
.account-fields{display:grid;gap:var(--tds-space-5)}
.account-submit{width:100%}
.account-links .account-link{padding-inline:0;justify-content:flex-start}
.account-links{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px 20px;margin-top:22px}
.account-error{color:#ffc5d5;font-size:13px;background:rgba(194,26,75,.2);padding:12px;border-radius:10px}
.account-notice{color:#e7ff37;font-size:13px;padding:11px 0}
.account-private{border-top:1px solid #493259;padding-top:18px;margin-top:24px;font-size:12px;color:#ab9abf}
.account-private svg{display:inline;vertical-align:-2px;margin-right:6px}
@media(max-width:480px){.account-header{padding:18px 20px}.account-header img{width:126px}.account-card{border-radius:20px;padding:26px 22px}.account-main{padding:12px 15px 48px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
`
