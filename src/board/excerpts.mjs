export function excerpts(text, question = '') {
  const sections = text.match(/[\s\S]{1,550}(?=\s|$)|[\s\S]{1,550}/gu) ?? []
  const words = question.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []
  return sections.map((section, index) => {
    const normalized = section.toLowerCase()
    return {
      number: index + 1,
      text: section.trim(),
      score: words.filter((word) => normalized.includes(word)).length,
    }
  }).filter((section) => section.text && (!question || section.score > 0))
    .sort((a, b) => b.score - a.score).slice(0, 4)
}
