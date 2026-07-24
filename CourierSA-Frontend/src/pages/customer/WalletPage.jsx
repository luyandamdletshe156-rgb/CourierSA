import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatCard, EmptyState, PageLoader, Pagination, Modal } from '@/components/ui'
import { walletApi } from '@/api'
import { useWallet } from '@/hooks/useWallet'
import { CreditCard, TrendingUp, TrendingDown, RefreshCw, ArrowUpRight, ArrowDownLeft, Plus } from 'lucide-react'
import { formatDate, formatZAR } from '@/utils'
import clsx from 'clsx'

const TX_STYLES = {
  Credit:     { icon: ArrowUpRight,   bg: 'bg-[#10B981]/10', text: 'text-[#10B981]', sign: '+' },
  Debit:      { icon: ArrowDownLeft,  bg: 'bg-[#EF4444]/10', text: 'text-[#EF4444]', sign: '−' },
  Refund:     { icon: RefreshCw,      bg: 'bg-[#1E63E9]/10', text: 'text-[#1E63E9]', sign: '+' },
  Adjustment: { icon: RefreshCw,      bg: 'bg-[#F59E0B]/10', text: 'text-[#F59E0B]', sign: '±' },
}

export default function WalletPage() {
  const [page, setPage]     = useState(1)
  const [topUpOpen, setTopUpOpen] = useState(false)
  const pageSize = 15

  const { balance, isLoading: balLoading } = useWallet()

  const { data, isLoading } = useQuery({
    queryKey: ['wallet-transactions', page],
    queryFn:  () => walletApi.transactions({ page, pageSize }),
    keepPreviousData: true,
  })

  const transactions = data?.data?.items ?? []
  const total        = data?.data?.totalCount ?? 0

  const credits = transactions.filter(t => t.type === 'Credit' || t.type === 'Refund')
                              .reduce((s, t) => s + t.amountZAR, 0)
  const debits  = transactions.filter(t => t.type === 'Debit')
                              .reduce((s, t) => s + t.amountZAR, 0)

  return (
    <AppShell title="Wallet">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Wallet</h1>
          <p className="page-subtitle">Manage your balance and view transactions</p>
        </div>
        <button className="btn-primary" onClick={() => setTopUpOpen(true)}>
          <Plus size={15} /> Top up wallet
        </button>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card col-span-1 bg-gradient-to-br from-[#172554] to-[#0A3D91] text-white border-0">
          <p className="text-sm font-medium text-white/80 mb-1">Available balance</p>
          {balLoading
            ? <div className="h-8 bg-white/20 rounded-lg animate-pulse w-32 mt-1" />
            : <p className="text-3xl font-bold font-mono">{formatZAR(balance)}</p>}
          <p className="text-xs text-[#93B4E8] mt-2">Use at checkout to pay for parcels</p>
        </div>
        <StatCard label="Credits this page"  value={formatZAR(credits)} icon={TrendingUp}   color="bg-[#10B981]" />
        <StatCard label="Debits this page"   value={formatZAR(debits)}  icon={TrendingDown}  color="bg-[#EF4444]" />
      </div>

      {/* Transaction list */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-bold text-[#172554]">Transaction history</h2>
          <span className="text-xs font-medium text-[#94A3B8]">{total} transactions</span>
        </div>

        {isLoading ? <PageLoader /> : transactions.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No transactions yet"
            description="Your wallet activity will appear here."
          />
        ) : (
          <>
            <div className="divide-y divide-[#D8E4F5]">
              {transactions.map(tx => {
                const style = TX_STYLES[tx.type] ?? TX_STYLES.Adjustment
                const Icon  = style.icon
                return (
                  <div key={tx.id} className="flex items-center gap-3.5 py-3.5">
                    <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', style.bg)}>
                      <Icon size={16} className={style.text} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#172554] truncate">
                        {tx.description ?? tx.referenceType ?? tx.type}
                      </p>
                      <p className="text-[11px] font-medium text-[#94A3B8] mt-0.5">
                        {formatDate(tx.createdAt, { time: true })}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={clsx('text-sm font-bold font-mono', style.text)}>
                        {style.sign}{formatZAR(tx.amountZAR)}
                      </p>
                      <p className="text-[11px] font-medium text-[#94A3B8] mt-0.5 font-mono">
                        Bal: {formatZAR(tx.balanceAfterZAR)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
          </>
        )}
      </div>

      {/* Top-up modal — for demo, shows instructions */}
      <Modal open={topUpOpen} onClose={() => setTopUpOpen(false)} title="Top up wallet" size="sm">
        <div className="space-y-4">
          <div className="bg-[#DCEEFF]/50 border border-[#D8E4F5] rounded-xl p-4 text-sm text-[#0A3D91]">
            <p className="font-bold mb-1">Payment gateway integration</p>
            <p className="text-xs font-medium leading-relaxed">
              In production this connects to PayFast or Peach Payments. For the demo, an administrator can credit your wallet via the Admin panel.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[100, 250, 500, 1000, 2500, 5000].map(amt => (
              <div key={amt} className="border border-[#D8E4F5] rounded-xl p-3 text-center text-sm font-bold font-mono text-[#172554] hover:border-[#1E63E9] hover:bg-[#F6FAFF] cursor-pointer transition-colors">
                {formatZAR(amt)}
              </div>
            ))}
          </div>
          <p className="text-[11px] font-medium text-[#94A3B8] text-center">
            Select an amount — payment gateway coming in Phase 2
          </p>
          <button className="btn-primary w-full justify-center" onClick={() => setTopUpOpen(false)}>
            Close
          </button>
        </div>
      </Modal>
    </AppShell>
  )
}