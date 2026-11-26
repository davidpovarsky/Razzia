import {
  lobbyJoinModeSchema,
  lobbyJoinPrimarySchema,
  lobbyPhoneRegionSchema,
  type LobbyPresentation,
} from "@razzia/extensions/core"
import { useTranslation } from "react-i18next"

interface Props {
  value: LobbyPresentation
  onChange: (value: LobbyPresentation) => void
}

const inputClass =
  "border-input bg-background h-10 min-w-0 rounded-md border px-2 text-sm"

export default function LobbyPresentationSettings({ value, onChange }: Props) {
  const { t } = useTranslation()
  const showWeb = value.joinMode !== "phone-only"
  const showPhone = value.joinMode !== "web-only"
  const change = (fields: Partial<LobbyPresentation>) =>
    onChange({ ...value, ...fields })
  const regions = {
    il: t("extensions:lobbyJoin.israel"),
    uk: t("extensions:lobbyJoin.uk"),
  }

  return (
    <fieldset className="border-input mt-4 grid gap-3 border-t pt-3 text-sm">
      <legend className="font-semibold">
        {t("extensions:lobbyJoin.title")}
      </legend>
      <label className="grid gap-1">
        {t("extensions:lobbyJoin.channels")}
        <select
          className={inputClass}
          value={value.joinMode === "standard" ? "both" : value.joinMode}
          onChange={(event) =>
            change({
              joinMode: lobbyJoinModeSchema.parse(event.currentTarget.value),
            })
          }
        >
          <option value="phone-only">
            {t("extensions:lobbyJoin.phoneOnly")}
          </option>
          <option value="web-only">{t("extensions:lobbyJoin.webOnly")}</option>
          <option value="both">{t("extensions:lobbyJoin.both")}</option>
        </select>
      </label>
      {showWeb && showPhone && (
        <label className="grid gap-1">
          {t("extensions:lobbyJoin.primary")}
          <select
            className={inputClass}
            value={value.joinPrimary ?? "phone"}
            onChange={(event) =>
              change({
                joinPrimary: lobbyJoinPrimarySchema.parse(
                  event.currentTarget.value,
                ),
              })
            }
          >
            <option value="phone">{t("extensions:roster.phoneLabel")}</option>
            <option value="web">{t("extensions:lobbyJoin.webOnly")}</option>
          </select>
        </label>
      )}
      {showPhone && (
        <>
          <label className="grid gap-1">
            {t("extensions:lobbyJoin.phoneLine")}
            <select
              className={inputClass}
              value={value.phoneRegion ?? "auto"}
              onChange={(event) =>
                change({
                  phoneRegion: lobbyPhoneRegionSchema.parse(
                    event.currentTarget.value,
                  ),
                })
              }
            >
              <option value="auto">{t("extensions:lobbyJoin.auto")}</option>
              <option value="il">{regions.il}</option>
              <option value="uk">{regions.uk}</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(["il", "uk"] as const).map((region) => (
              <label className="grid min-w-0 gap-1" key={region}>
                {regions[region]}
                <input
                  className={inputClass}
                  type="tel"
                  autoComplete="off"
                  dir="ltr"
                  maxLength={32}
                  value={value.dialNumbers?.[region] ?? ""}
                  onChange={(event) =>
                    change({
                      dialNumbers: {
                        ...value.dialNumbers,
                        [region]: event.currentTarget.value || undefined,
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
        </>
      )}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.showPin ?? showWeb}
          onChange={(event) => change({ showPin: event.currentTarget.checked })}
        />
        {t("extensions:lobbyJoin.showPin")}
      </label>
      {showWeb && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.showQr ?? true}
            onChange={(event) =>
              change({ showQr: event.currentTarget.checked })
            }
          />
          {t("game:showQrCode")}
        </label>
      )}
    </fieldset>
  )
}
