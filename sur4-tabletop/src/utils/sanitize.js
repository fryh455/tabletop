export function sanitizeString(str, maxLength=1000){
  if(typeof str !== 'string') return '';
  let s = str.replace(/[\u0000-\u001F\u007F]/g, '');
  return s.slice(0, maxLength);
}
