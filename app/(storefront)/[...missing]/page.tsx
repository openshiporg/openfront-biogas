import { notFound } from 'next/navigation'

// Any address the storefront does not have gets the storefront's own not-found page, with its header and footer.
export default function Missing() {
  notFound()
}
