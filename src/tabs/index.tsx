import { registerTab } from '../core/tabs'
import ExpensesTab from './expenses/ExpensesTab'

// Documents and Locations are placeholders; each will move into its own folder as it is built.
const comingSoon = () => <p>This tab is being built. It will appear here soon.</p>

registerTab({
  id: 'expenses', title: 'Expenses', icon: '💰', color: '#16a34a',
  blurb: 'Track spending in riyal and rupees', render: (account) => <ExpensesTab account={account} />,
})
registerTab({
  id: 'documents', title: 'Documents', icon: '📄', color: '#2563eb',
  blurb: 'Keep important papers safe', render: comingSoon,
})
registerTab({
  id: 'locations', title: 'Locations', icon: '📍', color: '#ea580c',
  blurb: 'Hospitals, markets and places you visit', render: comingSoon,
})
