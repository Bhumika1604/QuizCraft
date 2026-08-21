"""
backend/urls.py
================
Root URL configuration. All JSON REST endpoints live under /api/.
All HTML pages are served by Django views in the `frontend` app (so the
project is a real Django application, not disconnected static HTML files).
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('', include('frontend.urls')),
]
