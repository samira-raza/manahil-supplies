import React from 'react';

// The reason a field blocks saving, shown under the field in red (D39)
const FieldMessage: React.FC<{ msg?: string }> = ({ msg }) =>
  msg ? <p className="text-xs font-bold text-red-600 mt-1" role="alert">{msg}</p> : null;

export default FieldMessage;
