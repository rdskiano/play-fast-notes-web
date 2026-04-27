import { Redirect } from 'expo-router';

// Library is the single landing per ROADMAP. Anything that hits / lands here
// and is redirected to /library.
export default function TabsIndex() {
  return <Redirect href="/library" />;
}
