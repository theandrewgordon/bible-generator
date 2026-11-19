import React from 'react';
export function ActionRow({children}) {return <div className="journey-actions">{children}</div>;}
export function StatusPanel({children,error=false}) {return <div className="journey-status" role={error?'alert':'status'}>{children}</div>;}
export function ActionLink({children,primary=false,...props}) {return <a className={'button '+(primary?'primary':'ghost')} {...props}>{children}</a>;}
