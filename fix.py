import codecs

with codecs.open('src/pages/CajaPage.tsx', 'r', 'utf-8') as f:
    content = f.read()

content = content.replace("selectedMethod === 'COP'", "selectedMethod === 'Efectivo COP'")
content = content.replace("selectedMethod === 'Divisas'", "selectedMethod === 'Efectivo USD'")
content = content.replace("method: 'COP'", "method: 'Efectivo COP'")
content = content.replace("method: 'Divisas'", "method: 'Efectivo USD'")
content = content.replace("method: 'Bs'", "method: 'Pago Móvil'")
content = content.replace("method === 'COP'", "method === 'Efectivo COP'")
content = content.replace("method === 'Divisas'", "method === 'Efectivo USD'")
content = content.replace("method === 'Bs'", "method === 'Pago Móvil'")
content = content.replace("historicDetailOrder.paymentMethod || 'Divisas'", "historicDetailOrder.paymentMethod || 'Efectivo USD'")

with codecs.open('src/pages/CajaPage.tsx', 'w', 'utf-8') as f:
    f.write(content)
