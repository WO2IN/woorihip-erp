/** 가로로 넘치는 월간 점검표를 처음 열 때 오늘 열이 가운데 오도록 스크롤한다. */
export function scrollToTodayColumn(box: HTMLDivElement | null) {
  if (!box || box.scrollWidth <= box.clientWidth) return
  const cell = box.querySelector<HTMLElement>('.today-col')
  if (!cell) return
  const offset = cell.getBoundingClientRect().left - box.getBoundingClientRect().left
  box.scrollLeft += offset - (box.clientWidth - cell.offsetWidth) / 2
}
