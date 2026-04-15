import InterfaceTableComponent from '@/components/mikrotik/Interface/InterfaceTableComponent'
import React from 'react'

const InterfacePage = () => {
  return (
    <div className='space-y-6 p-6'>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Interface Monitoring
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Real-time interface traffic and status monitoring
        </p>
      </div>

      <div>
        <InterfaceTableComponent />
      </div>
    </div>
  )
}

export default InterfacePage