/** Site-only token bridge around the original package management behavior. */
export const packageStyle = `
.site-package-tools{--color-primary:var(--tds-action);--color-secondary:var(--tds-action-text);--color-muted-foreground:var(--tds-muted-text);--color-accent:var(--tds-elevated);--color-foreground:var(--tds-text);margin-top:var(--tds-space-8);font-family:inherit;color:var(--tds-text)}
.site-package-tools [data-testid="package-manager"]{max-height:none;overflow:visible;border:1px solid var(--tds-border);border-radius:var(--tds-radius-card);background:var(--tds-surface);padding:clamp(var(--tds-space-5),3vw,calc(var(--tds-space-6) + var(--tds-space-2)));box-shadow:var(--tds-shadow-raised)}
.site-package-tools [data-testid="package-manager"]>div:first-child{gap:var(--tds-space-5);margin-bottom:var(--tds-space-5)}
.site-package-tools h2{font-family:inherit;font-size:clamp(20px,2.3vw,25px);font-weight:var(--tds-weight-heading);line-height:1.2;letter-spacing:-.035em;margin:0}
.site-package-tools button{font-family:inherit;font-size:var(--tds-type-label);font-weight:var(--tds-weight-label);line-height:1.3;min-height:var(--tds-button-min-height);padding:var(--tds-space-3) var(--tds-space-4);border-radius:var(--tds-button-radius);border:1px solid transparent;background:var(--tds-action);color:var(--tds-action-text);box-shadow:var(--tds-shadow-raised);white-space:normal;overflow-wrap:anywhere;transition:background var(--tds-motion-fast) var(--tds-motion-easing),border-color var(--tds-motion-fast) var(--tds-motion-easing)}
.site-package-tools button[class*="bg-accent"]{background:var(--tds-elevated);color:var(--tds-text);border-color:var(--tds-border);box-shadow:none}
.site-package-tools button:hover:not(:disabled){filter:brightness(1.08)}
.site-package-tools button:disabled{opacity:.55;cursor:not-allowed;box-shadow:none}
.site-package-tools button:focus-visible,.site-package-tools input:focus-visible{outline:2px solid var(--tds-focus);outline-offset:var(--tds-space-1)}
.site-package-tools [data-testid="package-preflight"]{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--tds-space-4);padding-top:var(--tds-space-5);border-top:1px solid var(--tds-border)}
.site-package-tools [data-testid="package-preflight"]>*{min-width:0;max-width:100%}.site-package-tools button,.site-package-tools ul,.site-package-tools li{min-width:0;max-width:100%}.site-package-tools button>div{min-width:0;white-space:normal}
.site-package-tools p{font-size:var(--tds-type-label);line-height:1.65;margin:0;overflow-wrap:anywhere}
.site-package-tools [data-testid="package-preflight"]>p:first-child{font-size:1.0625rem;font-weight:var(--tds-weight-heading);color:var(--tds-text)}
.site-package-tools [data-testid="package-preflight"]>button{justify-self:start;background:var(--tds-elevated);color:var(--tds-text);border-color:var(--tds-border);box-shadow:none}
.site-package-tools [role="status"]{color:var(--tds-success);font-size:var(--tds-type-caption);font-weight:var(--tds-weight-label)}
.site-package-tools [role="alert"]{color:var(--tds-danger);background:color-mix(in srgb,var(--tds-danger) 12%,transparent);border-radius:var(--tds-radius-control);padding:var(--tds-space-3)}
.site-package-tools label{font-size:var(--tds-type-label);line-height:1.5;gap:var(--tds-space-3);align-items:flex-start}
.site-package-tools input[type="checkbox"]{accent-color:var(--tds-action);width:18px;height:18px;flex:none;margin-top:1px}
.site-package-tools ul{list-style:none;padding:0;margin:var(--tds-space-5) 0 0;display:grid;gap:var(--tds-space-3)}
.site-package-tools li{border:1px solid var(--tds-border);border-radius:var(--tds-radius-control);padding:var(--tds-space-3);background:var(--tds-background);gap:var(--tds-space-3);font-size:var(--tds-type-caption)}
.site-package-tools li>span{color:var(--tds-muted-text);flex:1;min-width:110px}
@media(max-width:530px){.site-package-tools [data-testid="package-manager"]>div:first-child{align-items:flex-start}.site-package-tools li{align-items:stretch}.site-package-tools li>button{flex:1 1 100%}.site-package-tools [data-testid="package-preflight"]>div.flex{gap:var(--tds-space-3)}}
@media(prefers-reduced-motion:reduce){.site-package-tools button{transition:none}}
`
