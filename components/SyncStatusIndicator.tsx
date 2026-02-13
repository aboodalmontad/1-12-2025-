
import * as React from 'react';
import { ArrowPathIcon, NoSymbolIcon, CheckCircleIcon, ExclamationCircleIcon } from './icons';
import { SyncStatus } from '../hooks/useSync';

interface SyncStatusIndicatorProps {
    status: SyncStatus;
    lastError: string | null; // This prop actually contains progress messages during 'syncing' status
    isDirty: boolean;
    isOnline: boolean;
    onManualSync: () => void;
    isAutoSyncEnabled: boolean;
    className?: string;
}

const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ status, lastError, isDirty, isOnline, onManualSync, isAutoSyncEnabled, className = "" }) => {
    
    let displayStatus;
    if (!isOnline) {
        displayStatus = {
            icon: <NoSymbolIcon className="w-5 h-5 text-gray-500" />,
            text: 'غير متصل',
            className: 'text-gray-500',
            title: 'أنت غير متصل بالإنترنت. التغييرات محفوظة محلياً.'
        };
    } else if (status === 'unconfigured' || status === 'uninitialized') {
         displayStatus = {
            icon: <ExclamationCircleIcon className="w-5 h-5 text-red-500" />,
            text: 'الإعداد مطلوب',
            className: 'text-red-500',
            title: 'قاعدة البيانات غير مهيأة.'
        };
    } else if (status === 'loading') {
         displayStatus = {
            icon: <ArrowPathIcon className="w-5 h-5 text-gray-500 animate-spin" />,
            text: 'جاري التحميل...',
            className: 'text-gray-500',
            title: 'جاري تحميل البيانات الأساسية...'
        };
    } else if (status === 'syncing') {
         displayStatus = {
            icon: <ArrowPathIcon className="w-5 h-5 text-blue-500 animate-spin" />, // Changed pulse to spin for clarity
            text: lastError || 'جاري المزامنة...', // Show the actual step description if available
            className: 'text-blue-500',
            title: lastError || 'جاري مزامنة بياناتك مع السحابة.'
        };
    } else if (status === 'error') {
         displayStatus = {
            icon: <ExclamationCircleIcon className="w-5 h-5 text-red-500" />,
            text: 'فشل المزامنة',
            className: 'text-red-500',
            title: `فشل المزامنة: ${lastError}`
        };
    } else if (isDirty) {
         displayStatus = {
            icon: <ArrowPathIcon className="w-5 h-5 text-yellow-600" />,
            text: 'تغييرات غير محفوظة',
            className: 'text-yellow-600',
            title: 'لديك تغييرات لم تتم مزامنتها بعد. اضغط للمزامنة.'
        };
    } else {
        displayStatus = {
            icon: <CheckCircleIcon className="w-5 h-5 text-green-500" />,
            text: 'متزامن',
            className: 'text-green-500',
            title: 'جميع بياناتك محدثة.'
        };
    }

    const canSyncManually = isOnline && status !== 'syncing' && status !== 'loading' && status !== 'unconfigured' && status !== 'uninitialized';

    return (
        <button
            onClick={canSyncManually ? onManualSync : undefined}
            disabled={!canSyncManually}
            className={`flex items-center gap-2 text-sm font-semibold p-2 rounded-lg transition-all duration-200 ${canSyncManually ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default'} ${className}`}
            title={displayStatus.title}
        >
            <div className="flex-shrink-0">
                {displayStatus.icon}
            </div>
            <span className={`${displayStatus.className} hidden sm:inline whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]`}>
                {displayStatus.text}
            </span>
        </button>
    );
};

export default SyncStatusIndicator;
