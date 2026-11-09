import type {Metadata} from 'next';
import './style.css';
export const metadata:Metadata={title:'EJE Laboral | Asistente de Integraciones',description:'Revisión manual de integraciones EJE No Penal'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}
