/**
 * Canonical answer colours matching Razzia palette tokens
 * (--color-answer-1 to --color-answer-5 in packages/web/src/index.css).
 */
export const CANONICAL_ANSWER_COLORS = [
  "#e69f00", // 1 - Amber
  "#56b4e9", // 2 - Sky Blue
  "#3dbfa0", // 3 - Teal
  "#cc79a7", // 4 - Purple / Pink
  "#0072b2", // 5 - Deep Blue
] as const

export const CANONICAL_ANSWER_LABELS = ["1", "2", "3", "4", "5"] as const

export interface PollOptionItem {
  answerIndex: number
  label: string
  count: number
  percentage: number
  imageUrl?: string
  alt?: string
}

export interface RankedPollOption extends PollOptionItem {
  rank: number
  isWinner: boolean
}

export interface RankedPollResult {
  totalVotes: number
  isZeroVotes: boolean
  isTie: boolean
  maxVotes: number
  winners: RankedPollOption[]
  runnersUp: RankedPollOption[]
  allSorted: RankedPollOption[]
}

/**
 * Pure ranking function for poll results.
 *
 * Rules:
 * 1. Total votes = sum of counts.
 * 2. Zero votes: isZeroVotes = true, winners = [], runnersUp = [], all options have rank 0 and isWinner false.
 * 3. Plurality: options with the highest vote count are winners (rank 1, isWinner true).
 * 4. Ties: if multiple options share the highest vote count (>0), all are co-winners.
 * 5. Runners-up: sorted descending by vote count.
 * 6. Deterministic tie-break for equal vote counts: original answerIndex ascending.
 * 7. Original answerIndex, label, media and alt stay intact.
 */
export function computePollRanking(
  options: PollOptionItem[],
): RankedPollResult {
  if (!options || options.length === 0) {
    return {
      totalVotes: 0,
      isZeroVotes: true,
      isTie: false,
      maxVotes: 0,
      winners: [],
      runnersUp: [],
      allSorted: [],
    }
  }

  const totalVotes = options.reduce(
    (sum, opt) => sum + (Number(opt.count) || 0),
    0,
  )

  if (totalVotes === 0) {
    const unranked: RankedPollOption[] = options.map((opt) => ({
      ...opt,
      count: 0,
      rank: 0,
      isWinner: false,
    }))

    return {
      totalVotes: 0,
      isZeroVotes: true,
      isTie: false,
      maxVotes: 0,
      winners: [],
      runnersUp: [],
      allSorted: unranked,
    }
  }

  // Sort descending by count; tie-break by original answerIndex ascending
  const sorted = [...options].sort((a, b) => {
    const countA = Number(a.count) || 0
    const countB = Number(b.count) || 0
    if (countB !== countA) {
      return countB - countA
    }
    return a.answerIndex - b.answerIndex
  })

  const maxVotes = Number(sorted[0].count) || 0
  const winners: RankedPollOption[] = []
  const runnersUp: RankedPollOption[] = []

  let currentRank = 1
  for (let i = 0; i < sorted.length; i++) {
    const opt = sorted[i]
    const count = Number(opt.count) || 0
    if (count === maxVotes && maxVotes > 0) {
      winners.push({
        ...opt,
        rank: 1,
        isWinner: true,
      })
    } else {
      if (i > 0 && (Number(sorted[i - 1].count) || 0) !== count) {
        currentRank = i + 1
      }
      runnersUp.push({
        ...opt,
        rank: currentRank,
        isWinner: false,
      })
    }
  }

  return {
    totalVotes,
    isZeroVotes: false,
    isTie: winners.length > 1,
    maxVotes,
    winners,
    runnersUp,
    allSorted: [...winners, ...runnersUp],
  }
}
