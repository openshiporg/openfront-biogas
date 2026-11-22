import type { Metadata } from 'next'
import { Figtree, Outfit } from 'next/font/google'
import { Header, Footer } from '../components/Shell'
import { getStore } from '../lib/data/store'
import '../styles.css'

const body = Figtree({ subsets: ['latin'], variable: '--font-sf', display: 'swap' })
const head = Outfit({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-sf-head', display: 'swap' })

export async function storefrontMetadata(): Promise<Metadata> {
  const store = await getStore()
  const name = store.name || 'Biogas systems'
  return {
    title: { default: name, template: `%s · ${name}` },
    description: store.heroText || store.about.split(/(?<=\.)\s/)[0] || `${name}: biogas systems for homes, farms and kitchens, installed and serviced.`,
  }
}

export function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`sf ${body.variable} ${head.variable} flex min-h-screen flex-col font-[family-name:var(--font-sf)] text-[1.02rem]`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
      <Header />
      <main id="main" className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
