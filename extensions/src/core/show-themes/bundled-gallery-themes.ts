import classicManifest from "./classic.manifest.json" with { type: "json" }
import galleryAssets from "./gallery-assets.json" with { type: "json" }
import {
  showThemeDefinitionSchema,
  type ShowThemeDefinition,
} from "./definition"

interface GalleryThemeStyle {
  id: string
  catalogueId: string
  names: readonly string[]
  descriptions: readonly string[]
  background: string
  mid: string
  accent: string
  secondary: string
}

// Names and short descriptions are authored for all supported editor locales.
const defaultLabels = [
  "Default",
  "Par défaut",
  "Standard",
  "Predeterminado",
  "Predefinito",
  "標準",
  "Varsayılan",
  "Mặc định",
  "ברירת מחדל",
]
const silentLabels = [
  "Silent",
  "Silencieux",
  "Stumm",
  "Silencio",
  "Silenzioso",
  "無音",
  "Sessiz",
  "Im lặng",
  "ללא קול",
]

const styles: readonly GalleryThemeStyle[] = [
  {
    id: "tadazz-electric-social",
    catalogueId: "crowd",
    background: "#18133c",
    mid: "#702d9a",
    accent: "#57e9ff",
    secondary: "#ef9fc3",
    names: [
      "Electric Social",
      "Rencontre électrique",
      "Electric Social",
      "Encuentro eléctrico",
      "Incontro elettrico",
      "エレクトリック・ソーシャル",
      "Elektrik Sosyali",
      "Kết nối rực rỡ",
      "מפגש מחשמל",
    ],
    descriptions: [
      "Vibrant rings and cyan light for lively group conversations.",
      "Des anneaux vibrants et une lumière cyan pour les échanges en groupe.",
      "Leuchtende Ringe und Cyanlicht für lebendige Gruppenrunden.",
      "Aros vibrantes y luz cian para conversaciones en grupo.",
      "Anelli vivaci e luce ciano per conversazioni di gruppo.",
      "鮮やかなリングとシアンの光でグループの会話を彩ります。",
      "Canlı grup sohbetleri için parlak halkalar ve camgöbeği ışık.",
      "Vòng tròn và ánh sáng xanh cho cuộc trò chuyện sôi nổi.",
      "טבעות צבעוניות ואור טורקיז למפגשים מלאי שיחה.",
    ],
  },
  {
    id: "tadazz-midnight-club",
    catalogueId: "quiz",
    background: "#071827",
    mid: "#143a58",
    accent: "#e8be69",
    secondary: "#94c9d6",
    names: [
      "Midnight Club",
      "Club de minuit",
      "Mitternachtsclub",
      "Club de medianoche",
      "Club di mezzanotte",
      "ミッドナイト・クラブ",
      "Gece Yarısı Kulübü",
      "Câu lạc bộ nửa đêm",
      "מועדון חצות",
    ],
    descriptions: [
      "Navy, brushed gold and Art Deco arches for a refined quiz night.",
      "Bleu marine, or et arches Art déco pour une soirée quiz élégante.",
      "Marineblau, Gold und Art-déco-Bögen für einen stilvollen Quizabend.",
      "Azul marino, oro y arcos art déco para un concurso elegante.",
      "Blu navy, oro e archi Art Déco per un quiz raffinato.",
      "ネイビー、ゴールド、アールデコのアーチで上品なクイズの夜を。",
      "Zarif bir bilgi yarışması için lacivert, altın ve Art Deco kemerler.",
      "Xanh hải quân, vàng và vòm Art Deco cho đêm đố vui thanh lịch.",
      "כחול עמוק, זהב וקשתות אר דקו לערב חידון אלגנטי.",
    ],
  },
  {
    id: "tadazz-storybook-grove",
    catalogueId: "story",
    background: "#12372b",
    mid: "#3a6553",
    accent: "#f4c983",
    secondary: "#a6d3a8",
    names: [
      "Storybook Grove",
      "Bosquet des histoires",
      "Märchenhain",
      "Bosque de cuentos",
      "Boschetto delle storie",
      "物語の森",
      "Masal Korusu",
      "Khu rừng cổ tích",
      "חורשת הסיפורים",
    ],
    descriptions: [
      "Forest greens, warm stars and gentle leaves for young storytellers.",
      "Verts forestiers, étoiles et feuillages pour les jeunes conteurs.",
      "Waldgrün, warme Sterne und sanfte Blätter für junge Erzähler.",
      "Verdes, estrellas cálidas y hojas para pequeños narradores.",
      "Verdi del bosco, stelle e foglie per giovani narratori.",
      "森の緑、温かな星、やさしい葉が物語を引き立てます。",
      "Küçük hikâyeciler için orman yeşili, sıcak yıldızlar ve yapraklar.",
      "Màu xanh rừng, sao ấm áp và lá dịu dàng cho người kể chuyện nhỏ.",
      "ירוק יער, כוכבים חמימים ועלים עדינים למספרי סיפורים צעירים.",
    ],
  },
  {
    id: "tadazz-colour-pop",
    catalogueId: "picture",
    background: "#132563",
    mid: "#3d4ba6",
    accent: "#ffaf8d",
    secondary: "#8edbdc",
    names: [
      "Colour Pop",
      "Éclat de couleurs",
      "Farbenfreude",
      "Explosión de color",
      "Esplosione di colore",
      "カラーポップ",
      "Renk Patlaması",
      "Sắc màu bật sáng",
      "חגיגת צבע",
    ],
    descriptions: [
      "Cobalt tiles, coral accents and original illustrated picture cards.",
      "Carreaux cobalt, touches corail et cartes illustrées originales.",
      "Kobaltblaue Formen, Koralle und originale Bildkarten.",
      "Formas cobalto, detalles coral y tarjetas ilustradas originales.",
      "Forme cobalto, accenti corallo e carte illustrate originali.",
      "コバルト色のタイル、コーラルのアクセント、オリジナルの絵札。",
      "Kobalt şekiller, mercan vurgular ve özgün resimli kartlar.",
      "Ô xanh coban, điểm nhấn san hô và thẻ tranh nguyên bản.",
      "צורות בכחול קובלט, נגיעות אלמוג וכרטיסי איור מקוריים.",
    ],
  },
  {
    id: "tadazz-curiosity-lab",
    catalogueId: "truth",
    background: "#093b3e",
    mid: "#17645d",
    accent: "#c5ef88",
    secondary: "#82d5c9",
    names: [
      "Curiosity Lab",
      "Laboratoire de curiosité",
      "Neugierlabor",
      "Laboratorio de curiosidad",
      "Laboratorio della curiosità",
      "好奇心ラボ",
      "Merak Laboratuvarı",
      "Phòng thí nghiệm tò mò",
      "מעבדת הסקרנות",
    ],
    descriptions: [
      "Botanical teal and lime geometry for discoveries and quick facts.",
      "Turquoise et géométrie citron vert pour les découvertes.",
      "Petrol und limettengrüne Geometrie für Fakten und Entdeckungen.",
      "Verde azulado y geometría lima para descubrir nuevos datos.",
      "Verde petrolio e geometrie lime per nuove scoperte.",
      "ティールとライムの幾何学模様で新しい発見を。",
      "Keşifler için petrol yeşili ve limon yeşili geometriler.",
      "Xanh ngọc và hình học xanh chanh cho khám phá mới.",
      "טורקיז ירקרק וגאומטריה בצבע ליים לגילויים ועובדות.",
    ],
  },
  {
    id: "tadazz-golden-hour",
    catalogueId: "finale",
    background: "#2c1738",
    mid: "#65404e",
    accent: "#f5c96b",
    secondary: "#e7c2d4",
    names: [
      "Golden Hour",
      "Heure dorée",
      "Goldene Stunde",
      "Hora dorada",
      "Ora dorata",
      "ゴールデンアワー",
      "Altın Saat",
      "Giờ vàng",
      "שעת הזהב",
    ],
    descriptions: [
      "Plum velvet, golden rays and fine stars for a memorable finale.",
      "Prune, rayons dorés et étoiles pour une finale mémorable.",
      "Pflaumentöne, goldene Strahlen und Sterne für ein großes Finale.",
      "Ciruela, rayos dorados y estrellas para una final memorable.",
      "Prugna, raggi dorati e stelle per un finale memorabile.",
      "プラム色、金色の光、繊細な星がフィナーレを彩ります。",
      "Unutulmaz bir final için mürdüm, altın ışıklar ve yıldızlar.",
      "Tím mận, tia vàng và sao cho màn kết đáng nhớ.",
      "קטיפה בגוון שזיף, קרני זהב וכוכבים לרגע סיום חגיגי.",
    ],
  },
  {
    id: "tadazz-family-fiesta",
    catalogueId: "family",
    background: "#3d2435",
    mid: "#774957",
    accent: "#ffbf91",
    secondary: "#c8dcaf",
    names: [
      "Family Fiesta",
      "Fête en famille",
      "Familienfest",
      "Fiesta familiar",
      "Festa in famiglia",
      "ファミリー・フィエスタ",
      "Aile Şenliği",
      "Ngày hội gia đình",
      "חגיגה משפחתית",
    ],
    descriptions: [
      "Warm terracotta, soft sage and paper confetti for every generation.",
      "Terre cuite, sauge et confettis pour toutes les générations.",
      "Warmes Terrakotta, Salbeigrün und Konfetti für alle Generationen.",
      "Terracota, salvia y confeti para todas las generaciones.",
      "Terracotta, salvia e coriandoli per tutte le generazioni.",
      "温かなテラコッタ、セージ、紙吹雪で世代をつなぎます。",
      "Her kuşak için sıcak terakota, adaçayı ve konfeti.",
      "Màu đất ấm, xanh xô thơm và hoa giấy cho mọi thế hệ.",
      "טרקוטה חמימה, ירוק מרווה וקונפטי לכל הדורות.",
    ],
  },
  {
    id: "tadazz-discovery-lab",
    catalogueId: "classroom",
    background: "#102e58",
    mid: "#245a83",
    accent: "#8bdced",
    secondary: "#f6d78a",
    names: [
      "Discovery Lab",
      "Laboratoire des découvertes",
      "Entdeckerlabor",
      "Laboratorio de descubrimientos",
      "Laboratorio delle scoperte",
      "発見ラボ",
      "Keşif Laboratuvarı",
      "Phòng khám phá",
      "מעבדת התגליות",
    ],
    descriptions: [
      "Ink blue, sky accents and orbital shapes for curious classrooms.",
      "Bleu encre, ciel et orbites pour les classes curieuses.",
      "Tintenblau, Himmelstöne und Umlaufbahnen für neugierige Klassen.",
      "Azul tinta, cielo y órbitas para aulas curiosas.",
      "Blu inchiostro, cielo e orbite per classi curiose.",
      "インクブルー、空色、軌道の形で教室の好奇心を育てます。",
      "Meraklı sınıflar için mürekkep mavisi, gök tonları ve yörüngeler.",
      "Xanh mực, xanh trời và quỹ đạo cho lớp học ham khám phá.",
      "כחול דיו, תכלת ומסלולי כוכבים לכיתות סקרניות.",
    ],
  },
  {
    id: "tadazz-team-together",
    catalogueId: "team",
    background: "#102e35",
    mid: "#27616a",
    accent: "#ffad98",
    secondary: "#9bd9d5",
    names: [
      "Team Together",
      "Équipe unie",
      "Gemeinsam im Team",
      "Equipo unido",
      "Squadra unita",
      "チーム・トゥギャザー",
      "Birlikte Takım",
      "Cùng một đội",
      "צוות ביחד",
    ],
    descriptions: [
      "Professional petrol, soft coral and connected shapes for teams.",
      "Pétrole, corail et formes reliées pour les équipes.",
      "Petrol, sanftes Korallrot und verbundene Formen für Teams.",
      "Petróleo, coral suave y formas conectadas para equipos.",
      "Petrolio, corallo tenue e forme connesse per le squadre.",
      "落ち着いたティール、コーラル、つながる形がチームを表現します。",
      "Takımlar için petrol, yumuşak mercan ve bağlantılı şekiller.",
      "Xanh trầm, san hô dịu và hình kết nối dành cho đội nhóm.",
      "טורקיז עמוק, אלמוג עדין וצורות מחוברות לצוותים וארגונים.",
    ],
  },
]

function makeGalleryTheme(style: GalleryThemeStyle): ShowThemeDefinition {
  const theme = showThemeDefinitionSchema.parse(classicManifest)
  const rename = (value: string) =>
    value.replace(/^tadazz-classic\./u, `${style.id}.`)
  theme.id = style.id
  theme.kind = "declarative"
  theme.nameKey = `gallery:${style.catalogueId}.name`
  theme.descriptionKey = `gallery:${style.catalogueId}.description`
  theme.provenance =
    "Original Tadazz public gallery theme, authored 19 November 2026. Source-controlled geometric artwork and existing trusted native stage; available to every account."
  const localize = (index: number) => ({
    [theme.nameKey]: style.names[index],
    [theme.descriptionKey]: style.descriptions[index],
    "extensions:themes.default": defaultLabels[index],
    "extensions:themes.silent": silentLabels[index],
  })
  theme.localizations = {
    en: localize(0),
    fr: localize(1),
    de: localize(2),
    es: localize(3),
    it: localize(4),
    ja: localize(5),
    tr: localize(6),
    vi: localize(7),
    he: localize(8),
  }
  theme.tokens = {
    ...theme.tokens,
    background: style.background,
    foreground: "#fff9ef",
    accent: style.accent,
    fontId: "rubik",
    imageSizing: "square-contain",
    palette: {
      night: style.background,
      purple: style.mid,
      violet: style.mid,
      pink: style.secondary,
      blue: style.secondary,
      royal: style.mid,
      lime: style.accent,
      gold: style.accent,
      cream: "#fff9ef",
      ink: style.background,
    },
  }
  const extras = galleryAssets.filter(
    (asset) =>
      asset.name === `${style.catalogueId}-backdrop` ||
      (style.catalogueId === "picture" &&
        asset.name.startsWith("picture-") &&
        asset.name !== "picture-backdrop"),
  )
  theme.assets.push(
    ...extras.map((asset) => ({
      id: `gallery-${asset.name}`,
      url: asset.url,
      kind: "image" as const,
      sha256: asset.sha256,
      bytes: asset.bytes,
      rights: "owner-authorized" as const,
      provenance:
        "Original vector geometry authored for Tadazz and rendered with Chromium on the Linux server on 19 November 2026. SVG sources and renderer are in extensions/site-assets/gallery. No external artwork.",
      preload: "slot" as const,
    })),
  )
  const backdropId = `gallery-${style.catalogueId}-backdrop`
  theme.posterAssetId = backdropId
  theme.adapterAssets.questionBackdrop = backdropId
  theme.adapterAssets.showBackdrop = backdropId
  for (const slot of Object.values(theme.slots)) {
    slot.defaultVariantId = rename(slot.defaultVariantId)
    for (const variant of slot.variants) {
      variant.id = rename(variant.id)
      variant.backgroundAssetId = backdropId
    }
  }
  for (const event of Object.values(theme.audioEvents)) {
    event.defaultVariantId = rename(event.defaultVariantId)
    for (const variant of event.variants) {
      variant.id = rename(variant.id)
    }
  }
  for (const cue of Object.values(theme.choreographyCues)) {
    cue.variantId = rename(cue.variantId)
  }

  return showThemeDefinitionSchema.parse(theme)
}

/** Built once from reviewed source; copied into each account/room registry. */
export const bundledGalleryThemes = Object.freeze(styles.map(makeGalleryTheme))
