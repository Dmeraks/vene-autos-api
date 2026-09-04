import { ClientPortalLandingAside } from '../components/portal/ClientPortalLandingAside'

/** Solo marketing + consulta pública. El acceso al panel es /portal-transaccional-interno/login. */
export function CommercialLandingPage() {
  return (
    <div className="va-landing-commercial-brand min-h-dvh w-full bg-black text-white">
      <ClientPortalLandingAside />
    </div>
  )
}
