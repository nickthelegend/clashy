import { TopNav, FloatNav, Hero } from './sections/Top'
import { How } from './sections/How'
import { Rail } from './sections/Rail'
import { ArenaSection, Break, Join, Footer } from './sections/Bottom'

export default function App() {
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
