import {NextResponse} from 'next/server';
export async function POST(){return NextResponse.json({error:'Ruta retirada: los cambios aprobados se almacenan exclusivamente en Neon'},{status:410})}
