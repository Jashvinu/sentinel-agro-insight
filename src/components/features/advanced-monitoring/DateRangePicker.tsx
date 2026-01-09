import React from 'react';
import { Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface DateRangePickerProps {
    startDate: string;
    endDate: string;
    onChange: (range: { start: string; end: string }) => void;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
    startDate,
    endDate,
    onChange,
}) => {
    const calculateDaysBetween = (start: string, end: string): number => {
        const startMs = new Date(start).getTime();
        const endMs = new Date(end).getTime();
        return Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));
    };

    const daysBetween = calculateDaysBetween(startDate, endDate);
    const windowCount = Math.floor(daysBetween / 10);

    const isValidRange = daysBetween >= 30 && daysBetween <= 180;

    const quickSelectOptions = [
        { label: '30 Days', days: 30 },
        { label: '60 Days', days: 60 },
        { label: '90 Days (Recommended)', days: 90 },
        { label: '120 Days', days: 120 },
        { label: '180 Days', days: 180 },
    ];

    const handleQuickSelect = (days: number) => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days);

        onChange({
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0],
        });
    };

    const handleStartDateChange = (value: string) => {
        onChange({ start: value, end: endDate });
    };

    const handleEndDateChange = (value: string) => {
        onChange({ start: startDate, end: value });
    };

    return (
        <div className="space-y-4">
            {/* Date Inputs */}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="start-date" className="text-sm font-medium">
                        Start Date
                    </Label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            id="start-date"
                            type="date"
                            value={startDate}
                            onChange={(e) => handleStartDateChange(e.target.value)}
                            className="pl-10"
                            max={endDate}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="end-date" className="text-sm font-medium">
                        End Date
                    </Label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            id="end-date"
                            type="date"
                            value={endDate}
                            onChange={(e) => handleEndDateChange(e.target.value)}
                            className="pl-10"
                            min={startDate}
                            max={new Date().toISOString().split('T')[0]}
                        />
                    </div>
                </div>
            </div>

            {/* Range Info */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                    <p className="text-sm font-medium">
                        {daysBetween} days selected
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {windowCount} windows of 10 days • {isValidRange ? 'Valid range' : 'Invalid range'}
                    </p>
                </div>
                {!isValidRange && (
                    <Badge variant="destructive" className="text-xs">
                        Range must be 30-180 days
                    </Badge>
                )}
                {isValidRange && (
                    <Badge variant="secondary" className="text-xs">
                        ✓ Valid
                    </Badge>
                )}
            </div>

            {/* Quick Select */}
            <div className="space-y-2">
                <Label className="text-sm font-medium">Quick Select</Label>
                <div className="flex flex-wrap gap-2">
                    {quickSelectOptions.map((option) => (
                        <Button
                            key={option.days}
                            variant={daysBetween === option.days ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleQuickSelect(option.days)}
                            className="text-xs"
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>
            </div>
        </div>
    );
};
