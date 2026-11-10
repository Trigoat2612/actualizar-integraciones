import ExcelJS from 'exceljs';
import {createHash} from 'node:crypto';

export const BASELINE_SHA256='ed94d77fb65cf73576ce5f8d76d31b2fc2d72a46cea01c26416a1cc985f80fbe';
export type BaselineRow={
 source_numero:string;source_name:string;observation:string;status:string;
 dependency:string;environment_enablement:string;situational_log:string;
 development_close:string;test_close:string;validation_close:string;
 documentation:string;criticality:string;considerations:string;excel_row_number:number;
};
export const normalizeName=(v:string)=>v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
const sourceNo=(v:string)=>Number((v.match(/^\s*(\d+)/)||[])[1]||0);
export const numbered=(v:string)=>sourceNo(v);
function cell(row:ExcelJS.Row,n:number){
 const c=row.getCell(n),v=c.value;
 if(v==null)return '';
 if(v instanceof Date)return v.toLocaleDateString('es-PE',{timeZone:'UTC'});
 if(typeof v==='object'&&'text' in v&&typeof v.text==='string')return v.text;
 const t=c.text;
 return String(t??v);
}
export async function readBaseline(buffer:Buffer){
 if(buffer.length>5_000_000)throw Error('El archivo Excel excede 5 MB');
 const hash=createHash('sha256').update(buffer).digest('hex');
 if(hash!==BASELINE_SHA256)throw Error('Este archivo no coincide con Lista_Integraciones_base.xlsx proporcionado como línea base. Usa exactamente el archivo original.');
 const wb=new ExcelJS.Workbook();
 await wb.xlsx.load(buffer);
 const ws=wb.getWorksheet('Seguimiento');
 if(!ws)throw Error('Falta la hoja Seguimiento');
 const head=['N°','Sistema a Integrar','Observación','Estado','Dependencia','Habilitacion de ambiente','Estado Situacional','F. Cierre Desarrollo','F.Cierre Pruebas - Softpla/GTI','F.Validacion GSJ','Documentación','Criticidad','Consideraciones'];
 for(let n=1;n<=head.length;n++){
  if(normalizeName(cell(ws.getRow(1),n))!==normalizeName(head[n-1]))throw Error('Encabezado distinto al archivo base en columna '+n);
 }
 const rows:BaselineRow[]=[];
 for(let r=2;r<=36;r++){
  const x=ws.getRow(r);
  const source_numero=cell(x,1).trim(),source_name=cell(x,2).trim();
  if(!sourceNo(source_numero)||!source_name)throw Error('Fila de integración inválida: '+r);
  rows.push({
   source_numero,source_name,observation:cell(x,3),
   status:cell(x,4).trim(),dependency:cell(x,5).trim(),
   environment_enablement:cell(x,6),situational_log:cell(x,7),
   development_close:cell(x,8),test_close:cell(x,9),validation_close:cell(x,10),
   documentation:cell(x,11),criticality:cell(x,12),considerations:cell(x,13),
   excel_row_number:r
  });
 }
 if(rows.length!==35||new Set(rows.map(r=>sourceNo(r.source_numero))).size!==35)
  throw Error('Se esperaban 35 integraciones con números únicos');
 return {hash,rows};
}
