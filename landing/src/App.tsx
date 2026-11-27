import { TopNav, FloatNav, Hero } from './sections/Top'
import { How } from './sections/How'
import { Rail } from './sections/Rail'
import { ArenaSection, Break, Join, Footer } from './sections/Bottom'
import { DownloadPage } from './sections/Download'

export default function App() {
  if (typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/download') return <DownloadPage />
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <TopNav />
      <FloatNav />
      <main id="main">
        <Hero />
        <How />
        <Rail />
        <ArenaSection />
        <Break />
        <Join />
      </main>
      <Footer />
    </>
  )
}
