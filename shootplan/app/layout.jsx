import './globals.css'

export const metadata = {
  title: 'ShootPlan',
  description: 'Professionelle Videoproduktions-Planung',
}

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
