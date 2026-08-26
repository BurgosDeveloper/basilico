import { Ingredient } from '../data/mockData';

export function getIngredientExtraPrice(
  ingredient: Ingredient | undefined | null,
  size: 'Grande' | 'Pequeña' = 'Grande',
  isHalf: boolean = false
): number {
  if (!ingredient) return 0;

  const rawBase = ingredient.priceGrandeCompleta !== undefined && ingredient.priceGrandeCompleta !== null
    ? ingredient.priceGrandeCompleta
    : (ingredient.priceUSD || 0);

  if (size === 'Grande') {
    if (isHalf) {
      if (ingredient.priceGrandeMitad !== undefined && ingredient.priceGrandeMitad !== null) {
        return ingredient.priceGrandeMitad;
      }
      return rawBase > 0 ? Number((rawBase / 2).toFixed(2)) : 0;
    }
    return rawBase;
  } else {
    if (isHalf) {
      if (ingredient.pricePequenaMitad !== undefined && ingredient.pricePequenaMitad !== null) {
        return ingredient.pricePequenaMitad;
      }
      const peqComp = ingredient.pricePequenaCompleta !== undefined && ingredient.pricePequenaCompleta !== null
        ? ingredient.pricePequenaCompleta
        : (rawBase > 0 ? rawBase / 2 : 0);
      return peqComp > 0 ? Number((peqComp / 2).toFixed(2)) : 0;
    }
    if (ingredient.pricePequenaCompleta !== undefined && ingredient.pricePequenaCompleta !== null) {
      return ingredient.pricePequenaCompleta;
    }
    return rawBase > 0 ? Number((rawBase / 2).toFixed(2)) : 0;
  }
}
