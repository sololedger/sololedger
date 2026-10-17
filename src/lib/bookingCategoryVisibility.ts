// Visibility applies only to a new ordinary/periodized booking, never history.
export interface BookingCategoryVisibility {
  id: string
  hidden_from_new_booking?: boolean | null
}

export function newBookingCategoryError(
  categories: readonly BookingCategoryVisibility[],
  id: string,
  ready: boolean,
): string | null {
  if (!ready) return 'Kontoplanen är inte färdigladdad. Läs in den igen innan du bokför.'
  if (!id) return 'Välj kategori innan du bokför.'
  const category = categories.find(item => item.id === id)
  if (!category) return 'Kategorin finns inte i din kontoplan. Välj en annan kategori.'
  if (category.hidden_from_new_booking === true) {
    return 'Kategorin är dold för ny bokföring. Visa den igen i Kontoplan eller välj en annan kategori.'
  }
  if (category.hidden_from_new_booking !== false) {
    return 'Kategorins synlighet kunde inte kontrolleras. Läs in kontoplanen igen.'
  }
  return null
}

export function visibleNewBookingCategories<T extends BookingCategoryVisibility>(categories: readonly T[], ready: boolean): T[] {
  return ready ? categories.filter(item => item.hidden_from_new_booking === false) : []
}
