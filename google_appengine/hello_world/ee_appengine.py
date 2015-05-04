"""A simple example of connecting to Earth Engine using App Engine."""



# Works in the local development environment and when deployed.
# If successful, shows a single web page with the SRTM DEM
# displayed in a Google Map.  See accompanying README file for
# instructions on how to set up authentication.

import os

import config
import ee
import jinja2
import webapp2
import collections
import logging
import json

jinja_environment = jinja2.Environment(
    loader=jinja2.FileSystemLoader(os.path.dirname(__file__)))


class MainPage(webapp2.RequestHandler):
  def get(self):                             # pylint: disable=g-bad-name
    """Request an image from Earth Engine and render it to a web page."""
    ee.Initialize(config.EE_CREDENTIALS, config.EE_URL)
    # mapid = ee.Image('strm90_v4').getMapId({'min': 0, 'max': 1000})
    imageCollection = ee.ImageCollection("LANDSAT/LE7_L1T")
    geometry = ee.Geometry.Polygon(
	[[[-97.03125, 27.963354676702952],
	  [-82.44140625, 28.273423646227233],
	  [-83.84765625, 30.266658976560755],
	  [-97.91015625, 30.1907194801663]]])
    myImageCollection = imageCollection.filterBounds(geometry).filterDate('2014-01-01', '2014-03-31')
    coll = myImageCollection.getInfo()
    result = []
    for each in range(0, len(coll)):
	imageID = coll["features"][each]["id"]
	result.append(imageID)
	print result
    list_ = result
    list_as_json = json.dumps(list_)
    print list_as_json
	
	#imageID.encode('utf8')
	#joe = logging.info(imageID["id"])
	#john = imageID["id"]
	#each = map(int, each)	
    # newStuff = result.split()



    # These could be put directly into template.render, but it
    # helps make the script more readable to pull them out here, especially
    # if this is expanded to include more variables.
    template_values = {
        'myList': list_as_json
	#'myBigString8': imageID1
        #'token': mapid['token']

    }
    template = jinja_environment.get_template('index.html')
    self.response.out.write(template.render(template_values))

app = webapp2.WSGIApplication([('/', MainPage)], debug=True)
