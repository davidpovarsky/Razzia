import type { ReactNode } from "react"
import { QUESTION_REGISTRY } from "@razzia/web/features/questions"
import { TADAZZ_PRODUCT_LOGO_URL } from "@razzia/extensions/core"
import type { ShowThemePreviewProps } from "./ClassicShowThemePreview"

export function NativeShowThemeView({
  nativeContent,
}: {
  nativeContent?: ReactNode
}) {
  return nativeContent
}

export function NativeShowThemePreview({
  previewTitle,
}: ShowThemePreviewProps) {
  const { AnswerComponent } = QUESTION_REGISTRY.single

  return (
    <div
      className="font-display bg-secondary flex size-full min-h-0 flex-col gap-4 overflow-auto rounded-xl p-4 text-white"
      style={{
        backgroundImage: 'url("/tadazz-show/razzia-original/background.png")',
        backgroundSize: "cover",
      }}
    >
      <img
        src={TADAZZ_PRODUCT_LOGO_URL}
        alt="TADAZZ!"
        className="h-10 w-auto self-center object-contain"
      />
      <h3 className="text-center text-xl font-bold">{previewTitle}</h3>
      <AnswerComponent
        answers={["A", "B", "C", "D"]}
        onSubmit={() => undefined}
        readOnly
      />
    </div>
  )
}
