/** View-only filtering; never use this subset to reconstruct account balances. */
export function personalViewMovements<T extends { isSharedWithHousehold: boolean }>(movements: T[], includeShared = false): T[] {
  return includeShared ? movements : movements.filter((movement) => !movement.isSharedWithHousehold);
}
