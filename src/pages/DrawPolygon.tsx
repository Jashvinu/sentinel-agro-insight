import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { ArrowLeft, Save, MapPin, X, Search, Trash2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { saveFarm, polygonsToFarmInsert } from '@/services/farmService';
import { Badge } from '@/components/ui/badge';
import { MAP_DEFAULTS } from '@/constants';

// Google Maps API Key - should be in environment variables
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

interface PolygonDrawingPageProps { }

interface DrawnPolygon {
    id: string;
    polygon: google.maps.Polygon;
    coordinates: number[][];
}

const DrawPolygon: React.FC<PolygonDrawingPageProps> = () => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<google.maps.Map | null>(null);
    const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
    const polygonRef = useRef<google.maps.Polygon | null>(null);
    const autocompleteInputRef = useRef<HTMLInputElement>(null);
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
    const boundsListenerRef = useRef<google.maps.MapsEventListener | null>(null);
    const [isMapLoaded, setIsMapLoaded] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [showNameDialog, setShowNameDialog] = useState(false);
    const [polygonName, setPolygonName] = useState('');
    const [drawnPolygons, setDrawnPolygons] = useState<DrawnPolygon[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const navigate = useNavigate();
    const { toast } = useToast();

    // Initialize Google Maps with new Places API pattern
    useEffect(() => {
        if (!mapRef.current || !GOOGLE_MAPS_API_KEY) {
            if (!GOOGLE_MAPS_API_KEY) {
                toast({
                    title: 'Google Maps API Key Missing',
                    description: 'Please set VITE_GOOGLE_MAPS_API_KEY in your environment variables.',
                    variant: 'destructive',
                });
            }
            return;
        }

        const initMap = async () => {
            try {
                // Set API key
                setOptions({
                    key: GOOGLE_MAPS_API_KEY,
                    v: 'weekly',
                    libraries: ['drawing', 'places'],
                });

                // Request needed libraries - following the sample pattern
                await Promise.all([
                    importLibrary('maps'),
                    importLibrary('places'),
                    importLibrary('drawing'),
                ]);

                // Create map
                const map = new google.maps.Map(mapRef.current!, {
                    center: MAP_DEFAULTS.NYC_CENTER,
                    zoom: 13,
                    mapTypeId: 'satellite',
                    streetViewControl: false,
                    fullscreenControl: true,
                    mapTypeControl: true, // Enable map type control to allow switching between satellite and other views
                });

                mapInstanceRef.current = map;

                // Initialize Drawing Manager
                const drawingManager = new google.maps.drawing.DrawingManager({
                    drawingMode: null,
                    drawingControl: true,
                    drawingControlOptions: {
                        position: google.maps.ControlPosition.TOP_CENTER,
                        drawingModes: [google.maps.drawing.OverlayType.POLYGON],
                    },
                    polygonOptions: {
                        fillColor: '#3388ff',
                        fillOpacity: 0.2,
                        strokeWeight: 3,
                        strokeColor: '#3388ff',
                        clickable: false,
                        editable: true,
                        zIndex: 1,
                    },
                });

                drawingManager.setMap(map);
                drawingManagerRef.current = drawingManager;

                // Listen for polygon completion
                google.maps.event.addListener(
                    drawingManager,
                    'overlaycomplete',
                    (event: google.maps.drawing.OverlayCompleteEvent) => {
                        if (event.type === google.maps.drawing.OverlayType.POLYGON) {
                            const polygon = event.overlay as google.maps.Polygon;
                            polygonRef.current = polygon;

                            // Get polygon path and convert to coordinates
                            const path = polygon.getPath();
                            const coordinates: number[][] = [];
                            path.forEach((latLng) => {
                                coordinates.push([latLng.lng(), latLng.lat()]);
                            });
                            // Close the polygon
                            if (coordinates.length > 0) {
                                coordinates.push([coordinates[0][0], coordinates[0][1]]);
                            }

                            // Create unique ID for this polygon
                            const polygonId = `polygon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                            
                            // Add to drawn polygons list
                            const newPolygon: DrawnPolygon = {
                                id: polygonId,
                                polygon,
                                coordinates,
                            };

                            setDrawnPolygons(prev => [...prev, newPolygon]);

                            // Disable drawing mode
                            drawingManager.setDrawingMode(null);
                            setIsDrawing(false);

                            // Show success message
                            toast({
                                title: 'Polygon Added',
                                description: `Polygon ${drawnPolygons.length + 1} has been added. You can draw more polygons or save the farm.`,
                                duration: 3000,
                            });

                            // Listen for polygon edits
                            google.maps.event.addListener(polygon, 'set_at', () => {
                                updatePolygonCoordinates(polygonId, polygon);
                            });

                            google.maps.event.addListener(polygon, 'insert_at', () => {
                                updatePolygonCoordinates(polygonId, polygon);
                            });
                        }
                    }
                );

                setIsMapLoaded(true);
            } catch (error) {
                toast({
                    title: 'Error Loading Map',
                    description: 'Failed to load Google Maps. Please check your API key and try again.',
                    variant: 'destructive',
                });
            }
        };

        initMap();

        return () => {
            if (drawingManagerRef.current) {
                drawingManagerRef.current.setMap(null);
            }
            if (polygonRef.current) {
                polygonRef.current.setMap(null);
            }
            if (boundsListenerRef.current) {
                google.maps.event.removeListener(boundsListenerRef.current);
            }
            if (autocompleteRef.current) {
                google.maps.event.clearInstanceListeners(autocompleteRef.current);
            }
        };
    }, [toast]);

    // Initialize Places Autocomplete using new Places API pattern
    useEffect(() => {
        if (!isMapLoaded || !autocompleteInputRef.current || !mapInstanceRef.current) {
            return;
        }

        const map = mapInstanceRef.current;

        const initAutocomplete = async () => {
            try {
                // Initialize Places API Autocomplete following the sample pattern
                const autocomplete = new google.maps.places.Autocomplete(
                    autocompleteInputRef.current!,
                    {
                        fields: ['geometry', 'name', 'formatted_address', 'place_id'],
                        types: ['geocode', 'establishment'],
                    }
                );

                autocompleteRef.current = autocomplete;

                // Use the bounds_changed event to restrict results to the current map bounds
                // Following the sample pattern
                boundsListenerRef.current = google.maps.event.addListener(map, 'bounds_changed', () => {
                    const bounds = map.getBounds();
                    if (bounds) {
                        autocomplete.setBounds(bounds);
                    }
                });

                // Set initial bounds
                if (map.getBounds()) {
                    autocomplete.setBounds(map.getBounds()!);
                }

                // When a place is selected - following sample pattern
                const placeListener = autocomplete.addListener('place_changed', () => {
                    const place = autocomplete.getPlace();
                    
                    // Check if place has geometry
                    if (!place.geometry || !place.geometry.location) {
                        toast({
                            title: 'Place Not Found',
                            description: 'No location details available for the selected place.',
                            variant: 'destructive',
                        });
                        return;
                    }

                    // Navigate to the place immediately
                    navigateToPlace(place);
                });

                // Helper function to navigate to a place - following the exact sample pattern
                const navigateToPlace = (place: google.maps.places.PlaceResult) => {
                    // Get location from place geometry (programmatic API uses geometry.location)
                    const location = place.geometry!.location!;
                    
                    // Convert to LatLng if needed
                    let latLng: google.maps.LatLng;
                    if (location instanceof google.maps.LatLng) {
                        latLng = location;
                    } else {
                        const loc = location as google.maps.LatLngLiteral;
                        latLng = new google.maps.LatLng(loc.lat, loc.lng);
                    }

                    // Navigate exactly like the sample: fitBounds if viewport exists, else setCenter + setZoom(17)
                    if (place.geometry!.viewport) {
                        // If the place has a viewport, fit it to the map (like sample)
                        map.fitBounds(place.geometry!.viewport!);
                    } else {
                        // Otherwise, center on the location with zoom 17 (exactly like sample)
                        map.setCenter(latLng);
                        map.setZoom(17);
                    }

                    // Update search query
                    const placeName = place.name || place.formatted_address || '';
                    setSearchQuery(placeName);

                    toast({
                        title: 'Location Found',
                        description: `Navigated to ${placeName}`,
                        duration: 3000,
                    });
                };

                return placeListener;
            } catch (error) {
                toast({
                    title: 'Error Initializing Search',
                    description: 'Failed to initialize location search. Please refresh the page.',
                    variant: 'destructive',
                });
            }
        };

        let placeListener: google.maps.MapsEventListener | undefined;

        initAutocomplete().then((listenerResult) => {
            placeListener = listenerResult;
        });

        return () => {
            if (placeListener) {
                google.maps.event.removeListener(placeListener);
            }
            if (boundsListenerRef.current) {
                google.maps.event.removeListener(boundsListenerRef.current);
                boundsListenerRef.current = null;
            }
            if (autocompleteRef.current) {
                google.maps.event.clearInstanceListeners(autocompleteRef.current);
            }
            autocompleteRef.current = null;
        };
    }, [isMapLoaded, toast]);

    // Update polygon coordinates when edited
    const updatePolygonCoordinates = useCallback((polygonId: string, polygon: google.maps.Polygon) => {
        const path = polygon.getPath();
        const coordinates: number[][] = [];
        path.forEach((latLng) => {
            coordinates.push([latLng.lng(), latLng.lat()]);
        });
        // Close the polygon
        if (coordinates.length > 0) {
            coordinates.push([coordinates[0][0], coordinates[0][1]]);
        }

        setDrawnPolygons(prev => 
            prev.map(p => p.id === polygonId ? { ...p, coordinates } : p)
        );
    }, []);

    // Start drawing
    const handleStartDrawing = useCallback(() => {
        if (drawingManagerRef.current) {
            drawingManagerRef.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
            setIsDrawing(true);
            toast({
                title: 'Drawing Mode Active',
                description: 'Click on the map to start drawing your polygon. Click to add points, then click the first point to close the polygon.',
                duration: 5000,
            });
        }
    }, [toast]);

    // Delete a specific polygon
    const handleDeletePolygon = useCallback((polygonId: string) => {
        setDrawnPolygons(prev => {
            const polygonToDelete = prev.find(p => p.id === polygonId);
            if (polygonToDelete) {
                polygonToDelete.polygon.setMap(null);
                return prev.filter(p => p.id !== polygonId);
            }
            return prev;
        });
        toast({
            title: 'Polygon Removed',
            description: 'Polygon has been removed.',
            duration: 2000,
        });
    }, [toast]);

    // Clear all polygons
    const handleClearAll = useCallback(() => {
        drawnPolygons.forEach(p => p.polygon.setMap(null));
        setDrawnPolygons([]);
        setShowNameDialog(false);
        setPolygonName('');
        toast({
            title: 'All Polygons Cleared',
            description: 'All polygons have been removed.',
            duration: 2000,
        });
    }, [drawnPolygons, toast]);

    // Save all polygons as one farm
    const handleSaveFarm = useCallback(async () => {
        if (drawnPolygons.length === 0) {
            toast({
                title: 'No Polygons',
                description: 'Please draw at least one polygon before saving.',
                variant: 'destructive',
            });
            return;
        }

        if (!polygonName.trim()) {
            toast({
                title: 'Invalid Input',
                description: 'Please provide a name for your farm.',
                variant: 'destructive',
            });
            return;
        }

        try {
            // Convert all polygons to GeoJSON Polygon format
            const polygons = drawnPolygons.map(dp => ({
                type: 'Polygon' as const,
                coordinates: [dp.coordinates],
            }));

            // Save to database using polygonsToFarmInsert
            const farmInsert = polygonsToFarmInsert(polygons, polygonName.trim());
            const { farm: savedFarm, error: saveError } = await saveFarm(farmInsert);

            if (saveError || !savedFarm) {
                const errorMessage = saveError?.message || 'Failed to save farm to database';
                toast({
                    title: 'Error Saving Farm',
                    description: errorMessage,
                    variant: 'destructive',
                });
                return;
            }

            toast({
                title: 'Farm Saved',
                description: `"${polygonName.trim()}" with ${drawnPolygons.length} polygon${drawnPolygons.length > 1 ? 's' : ''} has been saved successfully.`,
            });

            // Navigate back to main page
            navigate('/');
        } catch (error) {
            toast({
                title: 'Error Saving Farm',
                description: error instanceof Error ? error.message : 'Failed to save farm to database.',
                variant: 'destructive',
            });
        }
    }, [drawnPolygons, polygonName, navigate, toast]);

    // Open name dialog when user clicks save
    const handleOpenNameDialog = useCallback(() => {
        if (drawnPolygons.length === 0) {
            toast({
                title: 'No Polygons',
                description: 'Please draw at least one polygon before saving.',
                variant: 'destructive',
            });
            return;
        }
        setShowNameDialog(true);
    }, [drawnPolygons, toast]);

    return (
        <div className="min-h-screen bg-background">
            <Card className="m-4">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate('/')}
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back
                            </Button>
                            <CardTitle className="flex items-center space-x-2">
                                <MapPin className="w-5 h-5 text-primary" />
                                <span>Draw Farm Polygon</span>
                            </CardTitle>
                        </div>
                        <div className="flex items-center space-x-2">
                            {drawnPolygons.length > 0 && (
                                <>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleClearAll}
                                    >
                                        <X className="w-4 h-4 mr-2" />
                                        Clear All
                                    </Button>
                                    <Button
                                        variant="default"
                                        size="sm"
                                        onClick={handleOpenNameDialog}
                                    >
                                        <Save className="w-4 h-4 mr-2" />
                                        Save Farm ({drawnPolygons.length})
                                    </Button>
                                </>
                            )}
                            <Button
                                variant={isDrawing ? 'default' : 'outline'}
                                size="sm"
                                onClick={handleStartDrawing}
                                disabled={!isMapLoaded || isDrawing}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                {isDrawing ? 'Drawing...' : 'Add Polygon'}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0 relative">
                    {/* Search Bar - positioned to not cover drawing controls or map buttons */}
                    <div className="absolute top-4 left-4 right-auto" style={{ zIndex: 2000000001, width: '320px', maxWidth: 'calc(100% - 2rem)' }}>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
                            <Input
                                ref={autocompleteInputRef}
                                type="text"
                                placeholder="Search for a location..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 pr-4 bg-background/95 backdrop-blur-sm border-2 shadow-lg w-full"
                                disabled={!isMapLoaded}
                            />
                        </div>
                    </div>

                    {/* Polygons List - positioned on the right side */}
                    {drawnPolygons.length > 0 && (
                        <div className="absolute top-4 right-4" style={{ zIndex: 2000000000, width: '280px', maxWidth: 'calc(100% - 2rem)' }}>
                            <Card className="bg-background/95 backdrop-blur-sm border-2 shadow-lg">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-semibold">
                                        Polygons ({drawnPolygons.length})
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0 space-y-2 max-h-64 overflow-y-auto">
                                    {drawnPolygons.map((dp, index) => (
                                        <div
                                            key={dp.id}
                                            className="flex items-center justify-between p-2 rounded-md border bg-muted/50 hover:bg-muted transition-colors"
                                        >
                                            <div className="flex items-center space-x-2">
                                                <Badge variant="outline" className="text-xs">
                                                    #{index + 1}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground">
                                                    {dp.coordinates.length - 1} points
                                                </span>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeletePolygon(dp.id)}
                                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    <div
                        ref={mapRef}
                        style={{ width: '100%', height: '600px' }}
                        className="rounded-lg"
                    />
                    {!isMapLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                            <div className="text-center space-y-2">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                                <p className="text-sm text-muted-foreground">Loading map...</p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Name Dialog */}
            <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Name Your Farm</DialogTitle>
                        <DialogDescription>
                            Enter a name for your farm with {drawnPolygons.length} polygon{drawnPolygons.length > 1 ? 's' : ''}. All polygons will be saved together as one farm.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            placeholder="e.g., Main Farm, Field Complex, etc."
                            value={polygonName}
                            onChange={(e) => setPolygonName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && polygonName.trim()) {
                                    handleSaveFarm();
                                }
                            }}
                            autoFocus
                        />
                        {drawnPolygons.length > 0 && (
                            <div className="mt-3 text-sm text-muted-foreground">
                                <p className="font-medium mb-1">Polygons to save:</p>
                                <ul className="list-disc list-inside space-y-1">
                                    {drawnPolygons.map((dp, index) => (
                                        <li key={dp.id}>Polygon {index + 1} ({dp.coordinates.length - 1} points)</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowNameDialog(false);
                                setPolygonName('');
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveFarm}
                            disabled={!polygonName.trim() || drawnPolygons.length === 0}
                        >
                            <Save className="w-4 h-4 mr-2" />
                            Save Farm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default DrawPolygon;
