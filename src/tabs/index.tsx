import { registerTab } from '../core/tabs'

// Placeholders for the first three tabs; each will move into its own folder
// (src/tabs/expenses, src/tabs/documents, src/tabs/locations) as it is built.
const comingSoon = () => <p>This tab is being built. It will appear here soon.</p>

registerTab({
  id: 'expenses', title: 'Expenses', icon: '💰', color: '#16a34a',
  blurb: 'Track spending in riyal and rupees', render: comingSoon,
})
registerTab({
  id: 'documents', title: 'Documents', icon: '📄', color: '#2563eb',
  blurb: 'Keep important papers safe', render: comingSoon,
})
registerTab({
  id: 'locations', title: 'Locations', icon: '📍', color: '#ea580c',
  blurb: 'Hospitals, markets and places you visit', render: comingSoon,
})
