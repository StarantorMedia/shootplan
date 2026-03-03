export const metadata = {
  title: 'ShootPlan',
  description: 'Professionelle Videoproduktions-Planung',
}

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}
