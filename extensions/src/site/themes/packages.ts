/** Site-only skin around the original, unchanged package management behavior. */
export const packageStyle = `
.site-package-tools{--color-primary:var(--lime);--color-secondary:#171029;--color-muted-foreground:var(--muted);--color-accent:#352343;--color-foreground:#f4e9ff;margin-top:32px;font-family:inherit;color:var(--text)}
.site-package-tools [data-testid="package-manager"]{max-height:none;overflow:visible;border:1px solid var(--line2);border-radius:22px;background:linear-gradient(145deg,#211332,#120c21);padding:clamp(20px,3vw,30px);box-shadow:0 18px 45px #0002}
.site-package-tools [data-testid="package-manager"]>div:first-child{gap:18px;margin-bottom:22px}
.site-package-tools h2{font-family:inherit;font-size:clamp(20px,2.3vw,25px);font-weight:800;line-height:1.2;letter-spacing:-.035em;margin:0}
.site-package-tools button{font-family:inherit;font-size:13px;font-weight:750;line-height:1.3;min-height:42px;padding:11px 16px;border-radius:12px;border:1px solid transparent;background:var(--lime);color:#171029;box-shadow:0 5px 18px #e5ff3710;white-space:normal;overflow-wrap:anywhere;transition:background .15s,border-color .15s}
.site-package-tools button[class*="bg-accent"]{background:#2b1b3b;color:#f4e9ff;border-color:#73518b;box-shadow:none}
.site-package-tools button:hover:not(:disabled){filter:brightness(1.08)}
.site-package-tools button:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.site-package-tools button:focus-visible,.site-package-tools input:focus-visible{outline:2px solid var(--lime);outline-offset:4px}
.site-package-tools [data-testid="package-preflight"]{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;padding-top:20px;border-top:1px solid var(--line)}
.site-package-tools [data-testid="package-preflight"]>*{min-width:0;max-width:100%}.site-package-tools button,.site-package-tools ul,.site-package-tools li{min-width:0;max-width:100%}.site-package-tools button>div{min-width:0;white-space:normal}
.site-package-tools p{font-size:14px;line-height:1.65;margin:0;overflow-wrap:anywhere}
.site-package-tools [data-testid="package-preflight"]>p:first-child{font-size:17px;font-weight:780;color:#fff}
.site-package-tools [data-testid="package-preflight"]>button{justify-self:start;background:#2b1b3b;color:#f4e9ff;border-color:#73518b;box-shadow:none}
.site-package-tools [role="status"]{color:#d8f98c;font-size:12px;font-weight:650}
.site-package-tools [role="alert"]{color:#ffc5d5;background:#c21a4b20;border-radius:12px;padding:12px}
.site-package-tools label{font-size:13px;line-height:1.5;gap:10px;align-items:flex-start}
.site-package-tools input[type="checkbox"]{accent-color:var(--lime);width:18px;height:18px;flex:none;margin-top:1px}
.site-package-tools ul{list-style:none;padding:0;margin:22px 0 0;display:grid;gap:12px}
.site-package-tools li{border:1px solid var(--line);border-radius:14px;padding:14px;background:#100a1d;gap:12px;font-size:12px}
.site-package-tools li>span{color:var(--muted);flex:1;min-width:110px}
@media(max-width:530px){.site-package-tools [data-testid="package-manager"]>div:first-child{align-items:flex-start}.site-package-tools li{align-items:stretch}.site-package-tools li>button{flex:1 1 100%}.site-package-tools [data-testid="package-preflight"]>div.flex{gap:10px}}
`
