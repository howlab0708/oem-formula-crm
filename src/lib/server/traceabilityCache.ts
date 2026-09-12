import { unstable_cache } from 'next/cache'
import { lookupFoodTraceability } from './foodTraceability'

// Public product facts only. Share successful lookups across visitors/server restarts.
// Revalidation failures retain the dated snapshot; thrown errors are never cached as "not found".
export const cachedFoodTraceability = unstable_cache(lookupFoodTraceability,
  ['public-ingredient-trace-v2'], { revalidate: 60 * 60 })
